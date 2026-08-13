// 종목 고르기. 온보딩 4단계(다중)와 워치리스트 ＋Add(단일)가 같은 화면을 쓴다 —
// 온보딩 안에 묻어두면 둘이 갈리고, 예쁜 온보딩 옆에 prompt() 가 남는다(watchlist.js
// startAddTicker 가 지금 그 prompt() 다 — 이 컴포넌트는 그걸 몰라야 한다. 둘을 잇는 일은
// 이 화면들 쪽 배선의 몫).
//
// 검색 전용 엔드포인트는 없다. forge-api.php 는 심볼을 못 찾을 때만 Yahoo 후보를 주므로
// (api.js 의 err.suggest — watchlist.js pendingSuggest 와 같은 경로) 큐레이션 그리드 +
// 직접 입력 + 오타 제안으로 간다.
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
    var sel = (o.preset || []).map(norm);

    var el = MSUi.el("div", "tp");
    var grid = MSUi.el("div", "tp-grid");
    var msg = MSUi.el("p", "tp-msg");

    function fire() { if (o.onChange) o.onChange(sel.slice()); }

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
      if (!api) { msg.textContent = Str ? Str.t.tpUnavailable : ""; return; }
      msg.textContent = Str ? Str.t.tpChecking : "";
      api.loadTicker(sym, "1day").then(function () {
        input.value = "";
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
    return { el: el, selected: function () { return sel.slice(); } };
  }

  return { CURATED: CURATED, toggle: toggle, create: create };
});
