// 내 예측 기록(시안 20b) — 고리가 쌓아온 원장.
//
// **오답을 먼저 보여주는 화면이다.** "빗나간 N건" 필터가 기본 탭 바로 옆에 있는 이유가
// 그것이다 — 찾아 들어가야 보이면 숨긴 것이고, 숨긴 순간 이 화면은 광고판이 된다.
//
// 퍼센트는 20건부터만(핸드오프 원칙 5). 그 전에는 **왜 없는지**를 진행 막대로 보여준다 —
// 침묵하면 "적중률 기능이 없다"로 읽히고, 20건을 채울 이유도 사라진다.
// 14건에 "67% 적중"은 우연이 실력처럼 보이는 구간이다.
(function () {
  "use strict";

  function el(tag, cls, text) { return MSUi.el(tag, cls, text); }

  var FILTERS = [
    { key: "all",  label: function () { return MSStr.t.rcAll; } },
    { key: "miss", label: function (n) { return MSStr.t.rcMissA + n + MSStr.t.rcMissB; } },
    { key: "deep", label: function () { return MSStr.t.rcDeep; } }
  ];

  function judged() {
    return ((MSStore.getPreds && MSStore.getPreds()) || [])
      .filter(function (r) { return r && r.judgedOn; })
      .sort(function (a, b) { return String(b.judgedOn).localeCompare(String(a.judgedOn)); });
  }

  function apply(list, key) {
    if (key === "miss") return list.filter(function (r) { return r.hit === false; });
    if (key === "deep") return list.filter(function (r) { return r.tier !== "basic"; });
    return list;
  }

  function render(rootEl) {
    var all = judged();
    var state = { filter: "all" };

    function draw() {
      rootEl.innerHTML = "";
      var scr = el("div", "scr rc-scr");

      var head = el("div", "rc-head");
      var back = el("button", "rc-back", MSStr.t.rpBack);
      back.addEventListener("click", function () { MSApp.go("watchlist"); });
      head.appendChild(back);
      head.appendChild(el("span", "rc-title", MSStr.t.rcTitle));
      scr.appendChild(head);

      if (!all.length) {
        scr.appendChild(el("p", "empty", MSStr.t.rcEmpty));
        rootEl.appendChild(scr);
        return;
      }

      // 진행 카드 — 20칸 중 몇 칸이 찼는지. 숫자 하나보다 이게 "얼마나 남았나"를 말한다.
      var rate = MSPreds.hitRate(all);
      var prog = el("div", "rc-prog");
      prog.appendChild(el("div", "rc-prog-h", all.length + MSStr.t.rcCounted));
      var segs = el("div", "rc-segs");
      for (var i = 0; i < MSPreds.MIN_N; i++) segs.appendChild(el("span", "rc-seg" + (i < all.length ? " is-on" : "")));
      prog.appendChild(segs);
      prog.appendChild(el("p", "rc-prog-n", rate
        ? (MSStr.t.rcRateA + Math.round(rate.rate * 100) + MSStr.t.rcRateB + rate.n + MSStr.t.rcRateC)
        : (all.length + MSStr.t.rcTooFewA + Math.max(0, MSPreds.MIN_N - all.length) + MSStr.t.rcTooFewB)));
      scr.appendChild(prog);

      // 필터 — "빗나간 N건"이 두 번째다(시안 20b: 기본 탭 옆).
      var misses = apply(all, "miss").length;
      var bar = el("div", "rc-filters");
      FILTERS.forEach(function (f) {
        var b = el("button", "rc-filter" + (state.filter === f.key ? " is-on" : ""), f.label(misses));
        b.addEventListener("click", function () { state.filter = f.key; draw(); });
        bar.appendChild(b);
      });
      scr.appendChild(bar);

      var rows = apply(all, state.filter);
      if (!rows.length) {
        scr.appendChild(el("p", "empty", MSStr.t.rcNoneInFilter));
      } else {
        rows.forEach(function (r) {
          var row = el("button", "rc-row");
          var l = el("div", "rc-row-l");
          l.appendChild(el("span", "rc-row-name", r.name || r.sym));
          l.appendChild(el("span", "rc-row-meta",
            r.judgedOn + MSStr.t.rdScopeSep + (r.tier === "basic" ? MSStr.t.rpTierBasic
              : r.tier === "custom" ? MSStr.t.rpTierCustom : MSStr.t.rpTierFull)));
          row.appendChild(l);
          row.appendChild(el("span", "rc-row-val", MSUi.fmtPrice(r.actual)));
          row.appendChild(el("span", "rc-row-verdict" + (r.hit ? " is-hit" : " is-miss"),
            r.hit ? MSStr.t.wlResHit : (MSUi.fmtPrice(r.miss) + MSStr.t.wlResMiss)));
          row.addEventListener("click", function () {
            MSStore.markPredSeen(r.sym, r.asOf);
            MSApp.go("result", { sym: r.sym, asOf: r.asOf });
          });
          scr.appendChild(row);
        });
      }
      rootEl.appendChild(scr);
    }

    draw();
  }

  window.MSRecord = { render: render, judged: judged, apply: apply, FILTERS: FILTERS };
})();
