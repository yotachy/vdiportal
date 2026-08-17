// 단계 선택 바텀시트(시안 6b — "얼마나 정밀하게?"). 3색 티어 카드 + 잠긴 전문분석.
// 차감 미리보기(5 → 2)는 표시 전용이다 — 실제 차감은 백엔드가 한다.
(function () {
  "use strict";

  var busy = false;   // 보조 가드 — 실제 이중 과금 차단은 report.js 의 모듈 스코프 purchases 레코드가 한다
                       // (화면을 떠났다 와도 유지된다). 여기는 같은 시트 안에서 Full 행 재탭·Run 재클릭으로
                       // onRun 이 두 번 불리는 것만 막는다.

  function close() {
    var s = document.querySelector(".sheet-scrim");
    if (s && s.parentNode) s.parentNode.removeChild(s);
  }

  // 시안 6b — 오른쪽 자리는 세 티어가 서로 다른 것을 보여준다: 기본은 "받음"(이미 무료로
  // 받았다), 심화·전문은 값(스쿱 수). 셋을 한 함수 안에서 분기하면 "왜 이 행만 다르게
  // 생겼나"를 코드가 스스로 설명한다.
  function tierRow(key, name, desc, opts) {
    var o = opts || {};
    var r = MSUi.el("button", "sheet-tier tier-" + key + (o.on ? " on" : ""));
    var left = MSUi.el("div", "sheet-tier-id");
    var nameRow = MSUi.el("div", "sheet-tier-name");
    nameRow.appendChild(MSUi.el("span", "sheet-tier-name-txt", name));
    if (o.popular) nameRow.appendChild(MSUi.el("span", "sheet-pop", MSStr.t.tsPopular));
    left.appendChild(nameRow);
    left.appendChild(MSUi.el("div", "sheet-tier-desc", desc));
    r.appendChild(left);

    // 잠금 분기는 없다 — P2 가 전문분석을 열면서 세 티어 모두 실행 가능해졌다. 안 쓰는
    // 분기를 남기면 다음 사람이 "잠긴 티어가 있다"로 읽는다(P1 Ruling H 와 같은 판단).
    if (o.done) {
      r.appendChild(MSUi.el("span", "sheet-tier-done", MSStr.t.tsDone));
    } else if (o.cost != null) {
      var price = MSUi.el("span", "sheet-tier-price");
      price.appendChild(MSUi.el("span", "sheet-tier-price-num", String(o.cost)));
      price.appendChild(MSUi.el("span", "sheet-tier-price-unit", MSStr.t.tsScoopUnit));
      r.appendChild(price);
    }

    if (o.onPick) r.addEventListener("click", o.onPick);
    return r;
  }

  // opts = { tier, balance, onRun(tier) }
  function open(opts) {
    var o = opts || {}, picked = "full";
    var bal = (typeof o.balance === "number") ? o.balance : null;
    busy = false;
    close();

    var scrim = MSUi.el("div", "sheet-scrim");
    scrim.addEventListener("click", function (e) { if (e.target === scrim) close(); });
    var sheet = MSUi.el("div", "sheet");

    function preview(cost) {
      // 표시 전용. 백엔드가 진짜 잔량을 돌려준다(SPEC §1).
      // 살 수 없으면 미리보기를 아예 안 낸다 — 바닥을 친 "3 → 0" 은 일어나지 않을 일을 그린 숫자다.
      if (bal == null || bal < cost) return "";
      return bal + " → " + (bal - cost);
    }
    function paint() {
      sheet.innerHTML = "";
      // 시안 6b 의 시트 머리 — 큰 제목("얼마나 정밀하게?") + 종목·보관 안내 부제. 예전엔
      // 제목 자체가 "Analyse {sym}" 이라 종목별로 달라졌는데, 시안은 제목을 고정해 "정밀도를
      // 고르는 화면"이라는 것부터 말하고 종목은 그 아래 한 줄로 내린다.
      var head = MSUi.el("div", "sheet-head");
      head.appendChild(MSUi.el("p", "sheet-title", MSStr.t.tsTitle));
      head.appendChild(MSUi.el("p", "sheet-subtitle", (o.name || o.sym || "") + MSStr.t.tsResultsKept));
      sheet.appendChild(head);

      var tiers = MSUi.el("div", "sheet-tiers");
      tiers.appendChild(tierRow("basic", MSStr.t.tsBasic, MSStr.t.tsBasicDesc, { done: true }));
      tiers.appendChild(tierRow("full", MSStr.t.tsFull, MSStr.t.tsFullDesc,
        { on: picked === "full", popular: true, cost: MSWallet.COSTS.full,
          onPick: function () { if (busy) return; picked = "full"; paint(); } }));
      // 전문분석(Pro) — P2 가 열었다. 자물쇠 대신 값이 붙고, 고르면 실행 버튼이 이 등급으로
      // 바뀐다. 실제 흐름은 호출부(report.js)가 전문분석 편집기(10a)를 여는 것이다:
      // 이 시트는 "얼마나 정밀하게"만 묻고, "어떤 지표를 얼마나"는 그 화면이 묻는다.
      tiers.appendChild(tierRow("custom", MSStr.t.tsCustom, MSStr.t.tsCustomDesc,
        { on: picked === "custom", cost: MSWallet.COSTS.custom,
          onPick: function () { if (busy) return; picked = "custom"; paint(); } }));
      sheet.appendChild(tiers);

      // 시안처럼 "쓰면 12 → 9"(왼쪽) · "최대 20"(오른쪽) 한 줄 — 비용 자체는 이미 심화분석
      // 행에 스쿱 수로 떠 있어 여기서 다시 적지 않는다. 둘 다 표시 전용이고 실제 차감·상한
      // 판정은 백엔드가 한다.
      var costLine = MSUi.el("div", "sheet-cost");
      var pv = preview(MSWallet.COSTS[picked]);
      if (pv) {
        var spend = MSUi.el("span", "sheet-cost-txt");
        spend.appendChild(MSUi.el("span", null, MSStr.t.tsSpendLead));
        spend.appendChild(MSUi.el("span", "sheet-cost-pv", pv));
        costLine.appendChild(spend);
      }
      // cap 은 서버가 준 실제 잔량 상한일 때만 그린다(o.cap) — 호출부가 안 주면 아무 것도
      // 안 그린다. 상한을 지어내 보여주지 않는다(코디네이터 판정 2026-08-16, 종목 슬롯 문구와
      // 같은 이유 — 뒷받침 없는 숫자는 화면에 안 올린다).
      if (o.cap != null) costLine.appendChild(MSUi.el("span", "sheet-cost-cap", MSStr.t.walCap + o.cap));
      if (pv || o.cap != null) sheet.appendChild(costLine);

      var cost = MSWallet.COSTS[picked];
      var run = MSUi.el("button", "btn btn-primary sheet-run",
        (picked === "custom" ? MSStr.t.tsCustom : MSStr.t.tsFull) + MSStr.t.tsRun);
      // bal == null 은 "0개 보유"가 아니라 "잔량을 모른다"(오프라인 등)다 — 그 상태로는 살 수
      // 있는지 없는지도 판단이 안 되므로 Run 을 켜 두면 안 된다(I-I, 리뷰 실측: 예전엔 bal==null
      // 이면 short 가 항상 false 라 버튼이 활성으로 남았다).
      var unavailable = (bal == null);
      var short = !unavailable && bal < cost;
      run.disabled = short || unavailable;
      if (unavailable) sheet.appendChild(MSUi.el("p", "sheet-short", MSStr.t.tsUnavailable));
      else if (short) sheet.appendChild(MSUi.el("p", "sheet-short", MSStr.t.tsShort));
      run.addEventListener("click", function () {
        if (busy) return;
        busy = true;
        run.disabled = true; run.textContent = MSStr.t.tsRunning;
        if (o.onRun) o.onRun(picked);
      });
      sheet.appendChild(run);
    }
    paint();

    scrim.appendChild(sheet);
    document.body.appendChild(scrim);
  }

  window.MSTierSheet = { open: open, close: close };
})();
