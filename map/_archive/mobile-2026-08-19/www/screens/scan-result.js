// 스캔 결과(시안 15c) — 광고 진입점 5가 붙는 자리.
//
// **경계 규칙이 이 화면의 전부다.** 스캔은 기본 5개로 "무엇이 달라졌는지"까지만 말한다.
// "왜 달라졌는지"는 유료 분석의 몫이다 — 스캔이 그것까지 말하면 팔 것이 없어진다.
// 그래서 여기엔 지표 판독도, 새 예측값도 없다. 방향이 바뀐 종목과 그 사실뿐이다.
//
// 뒤집힌 것이 없으면 이 화면으로 오지 않는다(watchlist 가 안 데려온다) — "그대로입니다"만
// 적힌 화면을 여는 것은 알림이 아니라 방해다.
(function () {
  "use strict";

  function el(tag, cls, text) { return MSUi.el(tag, cls, text); }

  // 방향 이름. 판정 없음(neutral)도 하나의 상태다 — "상승 우세 ↔ 판정 없음"이 시안의 예다.
  function dirName(d) {
    return d === "bull" ? MSStr.t.rpBullish : d === "bear" ? MSStr.t.rpBearish : MSStr.t.blNoVerdictHead;
  }

  function flips() {
    var out = [];
    (MSStore.getWatchlist() || []).forEach(function (it) {
      var r = MSStore.getScan(it.sym);
      if (r && r.flipped) out.push({ sym: it.sym, name: it.name, rec: r });
    });
    return out;
  }

  function render(rootEl) {
    var list = flips();
    var total = (MSStore.getWatchlist() || []).length;

    rootEl.innerHTML = "";
    var scr = el("div", "scr sr-scr");

    var head = el("div", "sr-head");
    var back = el("button", "sr-back", MSStr.t.rpBack);
    back.addEventListener("click", function () { MSApp.go("watchlist"); });
    head.appendChild(back);
    head.appendChild(el("span", "sr-title", MSStr.t.srTitle));
    head.appendChild(el("span", "sr-when", MSStr.t.srFree));
    scr.appendChild(head);

    if (!list.length) {
      scr.appendChild(el("p", "empty", MSStr.t.srNone));
      rootEl.appendChild(scr);
      return;
    }

    scr.appendChild(el("h1", "sr-h", list.length + MSStr.t.srFlipped));
    scr.appendChild(el("p", "sr-sub",
      MSStr.t.srSubA + Math.max(0, total - list.length) + MSStr.t.srSubB));

    list.forEach(function (f) {
      var card = el("button", "sr-card");
      var top = el("div", "sr-card-top");
      top.appendChild(el("span", "sr-card-name", f.name || f.sym));
      top.appendChild(el("span", "sr-card-sym", f.sym));
      card.appendChild(top);
      // 무엇이 무엇으로 바뀌었는지 — 이것이 스캔이 말할 수 있는 전부다.
      card.appendChild(el("div", "sr-card-flip",
        dirName(f.rec.prevDir) + MSStr.t.srArrow + dirName(f.rec.dir)));
      card.addEventListener("click", function () { MSApp.go("report", { sym: f.sym }); });
      scr.appendChild(card);
    });

    // 경계를 사용자에게도 말한다 — 스캔이 무료인 이유이자 분석이 유료인 이유다.
    scr.appendChild(el("p", "sr-note", MSStr.t.srBoundary));

    var go = el("button", "btn btn-primary sr-go",
      MSStr.t.srOpenA + (list[0].name || list[0].sym) + MSStr.t.srOpenB);
    go.addEventListener("click", function () { MSApp.go("report", { sym: list[0].sym }); });
    scr.appendChild(go);

    rootEl.appendChild(scr);
  }

  window.MSScanResult = { render: render, flips: flips, dirName: dirName };
})();
