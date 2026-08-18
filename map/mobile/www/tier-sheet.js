// 단계 선택 바텀시트(시안 6b — "얼마나 정밀하게?"). 3색 티어 카드.
// 차감 미리보기(5 → 2)는 표시 전용이다 — 실제 차감은 백엔드가 한다.
// 잠금(o.locked)은 P2 가 지웠다가(전문분석을 열면서, P1 Ruling H) 이번에 다른 이유로
// 되살아났다 — report-blocks.js 가 선언한 블록을 아직 못 그리는 티어는 **팔지 않는다**
// (리뷰 판정, 2026-08-18). report.js 의 pendingOf()/tierBuyable() 이 그 조건을 계산해
// locked:{full,custom} 로 넘긴다. 예전엔 custom 만 잠글 수 있었는데, 이번엔 full 도
// 잠길 수 있어 어느 한쪽도 기본 선택으로 남으면 안 된다(아래 open() 의 picked 계산).
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
    var r = MSUi.el("button", "sheet-tier tier-" + key + (o.on ? " on" : "") + (o.locked ? " is-locked" : ""));
    var left = MSUi.el("div", "sheet-tier-id");
    var nameRow = MSUi.el("div", "sheet-tier-name");
    nameRow.appendChild(MSUi.el("span", "sheet-tier-name-txt", name));
    if (o.popular && !o.locked) nameRow.appendChild(MSUi.el("span", "sheet-pop", MSStr.t.tsPopular));
    left.appendChild(nameRow);
    left.appendChild(MSUi.el("div", "sheet-tier-desc", desc));
    r.appendChild(left);

    // 자물쇠는 공용(MSUi.lockIcon) — 지표·종목과 같은 하나(ui-marks.test.mjs 가 화면마다
    // 다시 그리는 것을 막는다). o.locked 가 o.done/o.cost 보다 먼저 온다 — 못 파는 티어는
    // 값도 "받음" 배지도 보여줄 게 없다.
    if (o.locked) {
      var lk = MSUi.el("span", "sheet-tier-locked");
      var ic = MSUi.el("span", "sheet-tier-lock-ic");
      ic.innerHTML = MSUi.lockIcon();
      lk.appendChild(ic);
      lk.appendChild(MSUi.el("span", null, MSStr.t.tsSoon));
      r.appendChild(lk);
    } else if (o.done) {
      r.appendChild(MSUi.el("span", "sheet-tier-done", MSStr.t.tsDone));
    } else if (o.cost != null) {
      var price = MSUi.el("span", "sheet-tier-price");
      price.appendChild(MSUi.el("span", "sheet-tier-price-num", String(o.cost)));
      price.appendChild(MSUi.el("span", "sheet-tier-price-unit", MSStr.t.tsScoopUnit));
      r.appendChild(price);
    }

    // 잠긴 행은 고를 수 없다 — onPick 을 아예 안 단다(리스너를 달고 무시하면 다음 사람이
    // "왜 눌러도 반응 없나"로 다시 판다). disabled 로 포커스·클릭 둘 다 막는다.
    if (o.locked) r.disabled = true;
    else if (o.onPick) r.addEventListener("click", o.onPick);
    return r;
  }

  // opts = { tier, balance, onRun(tier), locked:{full,custom} }
  function open(opts) {
    var o = opts || {}, locked = o.locked || {};
    // 기본 선택은 "지금 살 수 있는 첫 번째"다 — 심화(full)를 먼저 본다(원래도 기본값이었다).
    // 심화도 잠겼으면 전문을, 둘 다 잠겼으면 null(고를 게 없다 — 아래 run 이 그 상태를 막는다).
    var picked = !locked.full ? "full" : (!locked.custom ? "custom" : null);
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
        { on: picked === "full", popular: true, locked: !!locked.full, cost: MSWallet.COSTS.full,
          onPick: function () { if (busy) return; picked = "full"; paint(); } }));
      // 전문분석(Pro) — 잠기지 않은 한 값이 붙고, 고르면 실행 버튼이 이 등급으로 바뀐다.
      // 실제 흐름은 호출부(report.js)가 전문분석 편집기(10a)를 여는 것이다: 이 시트는
      // "얼마나 정밀하게"만 묻고, "어떤 지표를 얼마나"는 그 화면이 묻는다.
      tiers.appendChild(tierRow("custom", MSStr.t.tsCustom, MSStr.t.tsCustomDesc,
        { on: picked === "custom", locked: !!locked.custom, cost: MSWallet.COSTS.custom,
          onPick: function () { if (busy) return; picked = "custom"; paint(); } }));
      sheet.appendChild(tiers);

      // picked 가 null 이면(심화·전문 둘 다 잠김) 고를 게 없다 — 비용 미리보기·Run 버튼을
      // 그리기 **전에** 여기서 끝낸다. 순서가 중요하다: preview(MSWallet.COSTS[picked]) 를
      // 먼저 부르면 picked=null → COSTS[null]=undefined → "9 → NaN" 이 그려진다(실측, 리뷰
      // 지시로 만든 관문 스크린샷에서 발견) — cost 가 없는 상태에서 cost 문구를 만들 수 없다.
      if (picked === null) {
        sheet.appendChild(MSUi.el("p", "sheet-short", MSStr.t.tsSoon));
        var run0 = MSUi.el("button", "btn btn-primary sheet-run", MSStr.t.tsFull + MSStr.t.tsRun);
        run0.disabled = true;
        sheet.appendChild(run0);
        return;
      }

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
        // picked 가 잠긴 티어일 수는 구조상 없다(잠긴 행은 onPick 이 안 달려 골라지지
        // 않는다) — 그래도 onRun 은 돈이 오가는 경로라 방어적으로 한 번 더 확인한다.
        if (locked[picked]) return;
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
