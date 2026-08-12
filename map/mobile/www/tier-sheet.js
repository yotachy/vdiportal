// 단계 선택 바텀시트(시안 7a 가 "A bottom sheet" 로 명시).
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

  function tierRow(key, name, desc, cost, opts) {
    var o = opts || {};
    var r = MSUi.el("button", "sheet-tier" + (o.on ? " on" : "") + (o.off ? " is-off" : ""));
    var left = MSUi.el("div", "sheet-tier-id");
    var nameRow = MSUi.el("div", "sheet-tier-name");
    nameRow.appendChild(MSUi.el("span", null, name));
    if (o.popular) nameRow.appendChild(MSUi.el("span", "sheet-pop", MSStr.t.tsPopular));
    left.appendChild(nameRow);
    left.appendChild(MSUi.el("div", "sheet-tier-desc", desc));
    r.appendChild(left);
    r.appendChild(MSUi.el("span", "sheet-preview", o.preview));
    if (!o.off && o.onPick) r.addEventListener("click", o.onPick);
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
      // 시안 7a 의 시트 머리 — 제목 왼쪽, **잔량 필** 오른쪽. 잔량이 필로 서 있어야 "얼마 있고
      // 얼마 쓰는지"가 읽힌다. 예전엔 행 우측의 작은 "5 → 2" 가 유일한 단서라 인지가 안 됐다.
      var head = MSUi.el("div", "sheet-head");
      head.appendChild(MSUi.el("span", "sheet-title", MSStr.t.tsTitle + (o.sym || "")));
      head.appendChild(MSWalletScreen.pill(null));
      sheet.appendChild(head);
      sheet.appendChild(tierRow("basic", MSStr.t.tsBasic, MSStr.t.tsBasicDesc, 0,
        { off: true, preview: MSStr.t.tsDone }));
      sheet.appendChild(tierRow("full", MSStr.t.tsFull, MSStr.t.tsFullDesc, MSWallet.COSTS.full,
        { on: picked === "full", popular: true, preview: MSStr.t.tsFullPreview,
          onPick: function () { if (busy) return; picked = "full"; paint(); } }));
      // 시안 7a 처럼 선택한 단계 바로 아래에 비용 한 줄 — "5 → 2" 는 여기서 부차 표기다.
      var costLine = MSUi.el("div", "sheet-cost");
      costLine.appendChild(MSUi.el("span", "sheet-cost-txt", MSStr.t.tsCostsLead + MSWallet.COSTS.full + MSStr.t.tsCost));
      var pv = preview(MSWallet.COSTS.full);
      if (pv) costLine.appendChild(MSUi.el("span", "sheet-cost-pv", pv));
      sheet.appendChild(costLine);

      sheet.appendChild(tierRow("custom", MSStr.t.tsCustom, MSStr.t.tsCustomDesc, MSWallet.COSTS.custom,
        { off: true, preview: MSStr.t.tsSoon }));

      var cost = MSWallet.COSTS[picked];
      var run = MSUi.el("button", "btn btn-primary sheet-run", MSStr.t.tsRun + MSStr.t.tsFull + " · " + cost + MSStr.t.tsCost);
      var short = (bal != null && bal < cost);
      run.disabled = short;
      if (short) sheet.appendChild(MSUi.el("p", "sheet-short", MSStr.t.tsShort));
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
