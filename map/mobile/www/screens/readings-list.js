// 판독문 전체(시안 20a). 리포트가 이미 계산한 판독을 다르게 보여주는 화면이다.
//
// **새 엔진 호출이 없다.** 리포트가 넘겨준 rows 를 그대로 그린다 — 여기서 다시 계산하면
// 같은 종목의 두 화면이 다른 숫자를 낼 수 있다(analyzeX 는 순수하지만 data 스냅샷이 갈린다).
//
// ⚠ 시안 20a 는 지표당 **3줄**(이름+기여도 / 평서문 해석 / 실측 수치)인데 이 구현은 2줄이다.
// 이유: 우리 판독문 코퍼스(readings.js)는 해석과 실측을 **한 문장에** 담는다
// ("72.4, 과매수 구간, 50선 위" — 시안이라면 2줄과 3줄로 갈랐을 내용이다). 3줄로 만들려면
// 32종 문장을 전부 평이체로 다시 쓰고 숫자를 떼어내야 하는데, 그 코퍼스에는 지표별 엔진
// 함정(미계산 구간·거래량 대체·스윙 문턱 등)을 피한 근거가 주석으로 박혀 있어 재작성 비용이
// 크고 잃을 것이 많다. 정보는 하나도 빠지지 않았고 줄 수만 다르다 — **확인됨: 2줄 유지**
// (P1b 마감, 사용자 결정 2026-08-19. G3 실행 안 함 — 32개 함수 반환 타입 전환 + 함정 14건
// 가드 재배치 비용이 그 차이에 비해 크다는 판단). 더 이상 확인 대기 항목이 아니다.
(function () {
  "use strict";

  var FILTERS = ["all", "up", "down", "none"];

  function dirOf(row) {
    if (row.bias == null) return "none";
    if (Math.abs(row.bias) <= MSIndicators.EPS) return "none";
    return row.bias > 0 ? "up" : "down";
  }

  // 키를 문자열로 조합해 조회하지 않는다 — MSStr.t 의 '죽은 키' 관문이 동적 조회를 볼 수
  // 없어서, 실제로는 쓰이는 문구가 "아무도 안 쓴다"로 잡히거나 그 반대가 된다.
  function filterLabel(k) {
    return k === "all" ? MSStr.t.rdF_all
         : k === "up" ? MSStr.t.rdF_up
         : k === "down" ? MSStr.t.rdF_down : MSStr.t.rdF_none;
  }

  function countBy(rows) {
    var c = { all: rows.length, up: 0, down: 0, none: 0 };
    rows.forEach(function (r) { c[dirOf(r)]++; });
    return c;
  }

  // 기여도 칸. bias 가 null 인 둘(trend·phasefold)은 0.00 이 아니라 대시다 —
  // 0.00 으로 적으면 "중립"으로 읽히는데 실제로는 방향을 물을 수 없는 지표다.
  function contribText(row) {
    if (row.bias == null) return MSStr.t.rpNoDirDash;
    return (row.bias > 0 ? "+" : "") + row.bias.toFixed(2);
  }

  // opts = { sym, name, rows, noDir, tier, preset, onBack }
  function render(root, opts) {
    var o = opts || {};
    var rows = (o.rows || []).concat(o.noDir || []);
    var sel = "all";

    root.innerHTML = "";
    var scr = MSUi.el("div", "scr rd-scr");

    var head = MSUi.el("div", "rd-head");
    var back = MSUi.el("button", "rd-back");
    back.setAttribute("aria-label", MSStr.t.rpBack);
    back.innerHTML = MSUi.backIcon ? MSUi.backIcon() : "";
    back.addEventListener("click", function () { if (o.onBack) o.onBack(); });
    head.appendChild(back);
    var titles = MSUi.el("div", "rd-titles");
    titles.appendChild(MSUi.el("h1", "rd-title", MSStr.t.rdTitle));
    // 무엇을 기준으로 읽은 판독인지 — 종목·주기·성향. 안 적으면 같은 문장이 다른 설정에서
    // 나온 것처럼 읽힌다(시안 20a 가 부제로 이 셋을 적는 이유).
    titles.appendChild(MSUi.el("p", "rd-scope",
      (o.name || o.sym || "") + MSStr.t.rdScopeSep + MSStr.t.rdScopeTf +
      (o.preset ? MSStr.t.rdScopeSep + o.preset + MSStr.t.rdScopeBasis : "")));
    head.appendChild(titles);
    scr.appendChild(head);

    var filterBar = MSUi.el("div", "rd-filters");
    var listWrap = MSUi.el("div", "rd-list");

    function drawList() {
      listWrap.innerHTML = "";
      var shown = 0;
      MSIndTiers.TIERS.forEach(function (t) {
        var inTier = rows.filter(function (r) {
          return MSIndTiers.lvOf(r.type) === t.lv && (sel === "all" || dirOf(r) === sel);
        });
        if (!inTier.length) return;
        listWrap.appendChild(MSUi.el("div", "overline", MSStr.t.rdLv + t.lv + MSStr.t.rdLvSep + t.name));
        inTier.forEach(function (r) {
          shown++;
          var card = MSUi.el("div", "rd-item");
          var line1 = MSUi.el("div", "rd-line1");
          var dot = MSUi.el("span", "rd-dot rd-" + dirOf(r));
          line1.appendChild(dot);
          line1.appendChild(MSUi.el("span", "rd-name", MSStr.ind(r.type)));
          line1.appendChild(MSUi.el("span", "rd-contrib rd-" + dirOf(r), contribText(r)));
          card.appendChild(line1);
          // 판독문. 무판정이어도 카드가 사라지지 않는다 — 이유와 함께 남는 것이 시안 규칙이다
          // ("읽을 만큼 큰 스윙이 없습니다"). 빼면 "왜 30개뿐이냐"가 된다.
          card.appendChild(MSUi.el("p", "rd-say", r.text || ""));
          listWrap.appendChild(card);
        });
      });
      if (!shown) listWrap.appendChild(MSUi.el("p", "empty", MSStr.t.rdEmpty));
    }

    function drawFilters() {
      var c = countBy(rows);
      filterBar.innerHTML = "";
      FILTERS.forEach(function (k) {
        var b = MSUi.el("button", "rd-filter" + (sel === k ? " on" : ""),
          filterLabel(k) + " " + c[k]);
        b.addEventListener("click", function () { sel = k; drawFilters(); drawList(); });
        filterBar.appendChild(b);
      });
    }

    drawFilters();
    drawList();
    scr.appendChild(filterBar);
    scr.appendChild(listWrap);
    root.appendChild(scr);
  }

  window.MSReadingsList = { render: render, dirOf: dirOf, countBy: countBy, FILTERS: FILTERS };
})();
