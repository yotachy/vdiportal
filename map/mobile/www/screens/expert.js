// 전문분석 편집기(시안 10a). 성향 프리셋 → 지표별 선택·배율 → 실행.
//
// 이 화면이 파는 것은 "더 맞는 예측"이 아니다(측정한 적 없다 — P2 §2 R3). 파는 것은
// **판정의 구성을 사용자가 정하는 것**이고, 그래서 화면은 적중률을 약속하지 않는다.
// 그 자리에는 지금 설정으로 계산되는 값(동의 지표 수)이 들어간다.
//
// UX 규칙 둘(시안 10a):
//  ① 슬라이더는 이름 **아래 줄**이다. 한 줄이면 트랙이 150px 로 줄어 0.1 단위 조절이 불가능하다.
//  ② 값은 항상 숫자 병기. 슬라이더만 두면 자기가 뭘 골랐는지 모른다.
(function () {
  "use strict";

  function close() {
    var s = document.querySelector(".xp-scrim");
    if (s && s.parentNode) s.parentNode.removeChild(s);
  }

  function fmtW(m) { return m.toFixed(1) + "×"; }

  // opts = { sym, name, balance, cost, initial, onRun(weights) }
  function open(opts) {
    var o = opts || {};
    close();

    // 시작 상태 — 넘겨받은 것이 있으면 그것, 없으면 첫 프리셋. 빈 화면에서 시작하지 않는다
    // (시안 10a: "기준 성향 — 가중치가 이미 채워져 있습니다").
    // 온보딩 2단계에서 고른 성향이 기본값이다(시안 11c: "고른 성향이 전문분석의 가중치
    // 기본값이 됩니다"). 저장된 게 없으면 첫 프리셋.
    var preset = o.presetKey || (MSStore.getStyle && MSStore.getStyle()) || MSIndTiers.PRESETS[0].key;
    var weights = o.initial || MSIndTiers.weightsOf(preset, MSGraph.BASIC);

    var scrim = MSUi.el("div", "xp-scrim");
    var sheet = MSUi.el("div", "xp-sheet");
    scrim.appendChild(sheet);
    scrim.addEventListener("click", function (e) { if (e.target === scrim) close(); });

    var head = MSUi.el("div", "xp-head");
    head.appendChild(MSUi.el("h2", "xp-title", MSStr.t.xpTitle));
    head.appendChild(MSUi.el("div", "xp-sub", (o.name || o.sym || "")));
    sheet.appendChild(head);

    var body = MSUi.el("div", "xp-body");
    sheet.appendChild(body);

    // ── 기준 성향 ────────────────────────────────────────────────────────────
    var presetSec = MSUi.el("div", "xp-sec");
    presetSec.appendChild(MSUi.el("div", "overline", MSStr.t.xpPreset));
    presetSec.appendChild(MSUi.el("p", "xp-hint", MSStr.t.xpPresetHint));
    var seg = MSUi.el("div", "xp-seg");
    presetSec.appendChild(seg);
    body.appendChild(presetSec);

    // ── 지표별 가중치 ────────────────────────────────────────────────────────
    var listSec = MSUi.el("div", "xp-sec");
    var listHead = MSUi.el("div", "rp-sec-head");
    listHead.appendChild(MSUi.el("span", "overline", MSStr.t.xpWeights));
    var countNote = MSUi.el("span", "rp-sec-note", "");
    listHead.appendChild(countNote);
    listSec.appendChild(listHead);
    var list = MSUi.el("div", "xp-list");
    listSec.appendChild(list);
    body.appendChild(listSec);

    // ── 하단 고정 ────────────────────────────────────────────────────────────
    var foot = MSUi.el("div", "xp-foot");
    // R3 이 비운 자리 — "예상 적중률 64%" 대신 **계산되는 값**을 둔다(P2 §5.4).
    // 전문분석 적중률은 사용자마다 가중치가 달라 하나로 환원되지 않는다. 재지 않았고 재서도
    // 안 된다 — 여기 퍼센트를 걸면 그것은 측정한 적 없는 값이다.
    var agree = MSUi.el("div", "xp-agree", "");
    foot.appendChild(agree);
    var actions = MSUi.el("div", "xp-actions");
    var reset = MSUi.el("button", "xp-reset", MSStr.t.xpReset);
    reset.addEventListener("click", function () {
      weights = MSIndTiers.weightsOf(preset, MSGraph.BASIC);
      drawSeg(); drawList(); drawFoot();
    });
    actions.appendChild(reset);
    var run = MSUi.el("button", "xp-run");
    run.appendChild(MSUi.el("span", null, MSStr.t.xpRun));
    var price = MSUi.el("span", "xp-price");
    price.appendChild(MSUi.el("span", "xp-price-num", String(o.cost)));
    price.appendChild(MSUi.el("span", "xp-price-unit", MSStr.t.tsScoopUnit));
    run.appendChild(price);
    run.addEventListener("click", function () {
      if (run.disabled) return;
      run.disabled = true;
      close();
      if (o.onRun) o.onRun(weights);
    });
    actions.appendChild(run);
    foot.appendChild(actions);
    sheet.appendChild(foot);

    function selectedCount() {
      var n = 0, k;
      for (k in weights) if (Object.prototype.hasOwnProperty.call(weights, k)) n++;
      return n;
    }

    function drawSeg() {
      seg.innerHTML = "";
      MSIndTiers.PRESETS.forEach(function (p) {
        var b = MSUi.el("button", "xp-seg-btn" + (p.key === preset ? " on" : ""), p.name);
        b.addEventListener("click", function () {
          preset = p.key;
          weights = MSIndTiers.weightsOf(preset, MSGraph.BASIC);
          drawSeg(); drawList(); drawFoot();
        });
        seg.appendChild(b);
      });
    }

    function drawFoot() {
      var tun = MSIndTiers.tunable().length;
      countNote.textContent = MSStr.t.xpSelA + selectedCount() + MSStr.t.xpSelB + tun +
        MSStr.t.xpSelC + MSGraph.W_MIN.toFixed(1) + MSStr.t.xpRangeDash + MSGraph.W_MAX.toFixed(1);
      // 잔량이 모자라면 실행을 막되, 잔량을 **모르면**(오프라인) 막지 않는다 — 뭘 근거로
      // 막는지 없이 막으면 사용자는 이유를 알 수 없다(P1 tier-sheet 의 같은 판단).
      var short = (o.balance != null && o.cost != null && o.balance < o.cost);
      run.disabled = short;
      agree.textContent = short ? MSStr.t.xpShort : "";
    }

    function drawList() {
      list.innerHTML = "";
      MSIndTiers.TIERS.forEach(function (t) {
        var types = t.types.filter(function (x) { return MSIndTiers.tunable().indexOf(x) >= 0; });
        if (!types.length) return;
        var core = (t.lv === 1);
        var h = MSUi.el("div", "xp-lv");
        h.appendChild(MSUi.el("span", "overline", MSStr.t.rdLv + t.lv + MSStr.t.rdLvSep + t.name));
        // Lv1 은 "항상 포함"이라 체크박스를 그리지 않는다 — 못 끄는 체크박스는 고장으로 보인다.
        if (core) h.appendChild(MSUi.el("span", "xp-fixed", MSStr.t.xpAlways));
        list.appendChild(h);

        types.forEach(function (type) {
          var on = Object.prototype.hasOwnProperty.call(weights, type);
          var row = MSUi.el("div", "xp-row" + (on ? "" : " off"));
          var line1 = MSUi.el("div", "xp-row-head");
          if (!core) {
            var cb = MSUi.el("button", "xp-check" + (on ? " on" : ""));
            cb.setAttribute("aria-pressed", on ? "true" : "false");
            cb.addEventListener("click", function () {
              if (on) delete weights[type];
              else weights[type] = 1.0;
              drawList(); drawFoot();
            });
            line1.appendChild(cb);
          }
          line1.appendChild(MSUi.el("span", "xp-name", MSStr.ind(type)));
          // ② 값은 항상 숫자 병기.
          line1.appendChild(MSUi.el("span", "xp-val", on ? fmtW(weights[type]) : MSStr.t.rpNoDirDash));
          row.appendChild(line1);

          // ① 슬라이더는 이름 아래 줄 — 한 줄이면 트랙이 150px 로 줄어 0.1 단위가 안 잡힌다.
          var sl = document.createElement("input");
          sl.type = "range";
          sl.className = "xp-slider";
          sl.min = String(MSGraph.W_MIN); sl.max = String(MSGraph.W_MAX); sl.step = "0.1";
          sl.value = String(on ? weights[type] : 1.0);
          sl.disabled = !on;
          sl.addEventListener("input", function () {
            weights[type] = MSGraph.clampW(parseFloat(sl.value));
            line1.lastChild.textContent = fmtW(weights[type]);
          });
          row.appendChild(sl);
          list.appendChild(row);
        });
      });
    }

    drawSeg(); drawList(); drawFoot();
    document.body.appendChild(scrim);
  }

  window.MSExpert = { open: open, close: close };
})();
