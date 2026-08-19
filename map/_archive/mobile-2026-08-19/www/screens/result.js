// 어제 결과 상세 — 고리의 두 번째 칸(시안 17b 맞힘 / 14b 빗나감).
//
// 두 화면은 같은 데이터를 쓰지만 **규칙이 정반대**라 한 화면 안에서 분기한다:
//   17b 맞힌 날  — 광고를 권한다(진입점 4). 기분이 좋을 때만 묻는다.
//   14b 빗나간 날 — **광고를 절대 권하지 않는다.** 대신 구체적 불만을 근거로 전문분석을
//                   제안한다("반대했던 6개 중 4개가 맞았습니다 — 올려서 다시 볼까요?").
// 이 비대칭이 이 화면의 전부다. 빗나간 날 광고를 붙이면 "틀려놓고 광고를 판다"가 되고,
// 그 한 번이 광고 동선 전체를 죽인다(핸드오프 원칙 7과 같은 이유).
//
// 결과는 **기록에 적힌 값으로만** 말한다. 오늘 다시 계산하면 어제 한 말이 사후 수정된다.
(function () {
  "use strict";

  function el(tag, cls, text) { return MSUi.el(tag, cls, text); }

  function find(sym, asOf) {
    var list = (MSStore.getPreds && MSStore.getPreds()) || [];
    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      if (r && r.sym === sym && (!asOf || r.asOf === asOf) && r.judgedOn) return r;
    }
    return null;
  }

  function render(rootEl, params) {
    var sym = String((params && params.sym) || "").toUpperCase();
    var rec = find(sym, params && params.asOf);

    rootEl.innerHTML = "";
    var scr = el("div", "scr rs-scr");

    var head = el("div", "rs-head");
    var back = el("button", "rs-back", MSStr.t.rpBack);
    back.addEventListener("click", function () { MSApp.go("watchlist"); });
    head.appendChild(back);
    head.appendChild(el("span", "rs-title", (rec && rec.name) || sym));
    scr.appendChild(head);

    if (!rec) {
      // 기록이 없으면 없다고 한다. 지어내지 않는다.
      scr.appendChild(el("p", "empty", MSStr.t.rsNone));
      rootEl.appendChild(scr);
      return;
    }

    scr.appendChild(el("p", "rs-when", MSStr.t.rsWhenA + rec.asOf + MSStr.t.rsWhenB + rec.judgedOn));

    // ── 판정 한 줄. 시안 17b 는 "문장 먼저" — 숫자를 먼저 던지지 않는다.
    var verdict = el("div", "rs-verdict" + (rec.hit ? " is-hit" : " is-miss"));
    verdict.appendChild(el("p", "rs-verdict-h", rec.hit ? MSStr.t.rsHit : MSStr.t.rsMiss));
    verdict.appendChild(el("p", "rs-verdict-s",
      MSStr.t.rsSaidA + MSUi.fmtPrice(rec.mid) + MSStr.t.rsSaidB + MSUi.fmtPrice(rec.actual) + MSStr.t.rsSaidC));
    scr.appendChild(verdict);

    // ── 눈금: 말한 범위와 실제가 어디 있었나. 막대 하나에 점 하나 — 숫자보다 이게 빠르다.
    var band = el("div", "rs-band");
    var track = el("div", "rs-band-track");
    var span = (rec.hi - rec.lo) || 1;
    // 실제가 범위 밖이면 눈금을 넓혀 그 밖까지 보이게 한다 — 밖인데 끝에 붙여 그리면
    // "간신히 벗어남"과 "크게 벗어남"이 같은 그림이 된다.
    var lo = Math.min(rec.lo, rec.actual), hi = Math.max(rec.hi, rec.actual);
    var pad = (hi - lo) * 0.12 || span * 0.12;
    lo -= pad; hi += pad;
    function at(v) { return ((v - lo) / (hi - lo)) * 100; }
    var fill = el("div", "rs-band-fill");
    fill.style.left = at(rec.lo) + "%";
    fill.style.width = Math.max(1, at(rec.hi) - at(rec.lo)) + "%";
    track.appendChild(fill);
    var mark = el("div", "rs-band-mark" + (rec.hit ? " is-hit" : " is-miss"));
    mark.style.left = at(rec.actual) + "%";
    track.appendChild(mark);
    band.appendChild(track);
    var ends = el("div", "rs-band-ends");
    ends.appendChild(el("span", "", MSUi.fmtPrice(rec.lo)));
    ends.appendChild(el("span", "", MSUi.fmtPrice(rec.hi)));
    band.appendChild(ends);
    scr.appendChild(band);
    scr.appendChild(el("p", "rs-gap", rec.hit
      ? MSStr.t.rsInside
      : (MSUi.fmtPrice(rec.miss) + MSStr.t.rsOutside)));

    // ── 좁혀서 빗나간 경우에만 나오는 문장(시안 14b). 조건이 아니면 아예 안 쓴다 —
    // 기본 범위를 기록하지 않았거나 기본도 빗나갔으면 이 말은 거짓이다.
    if (rec.narrowedAndMissed) {
      var box = el("div", "rs-insight");
      box.appendChild(el("p", "rs-insight-h", MSStr.t.rsBasicWouldHit));
      box.appendChild(el("p", "rs-insight-b",
        MSUi.fmtPrice(rec.basicLo) + MSStr.t.rpRangeDash + MSUi.fmtPrice(rec.basicHi) +
        MSStr.t.rsNarrowNote));
      scr.appendChild(box);
    }

    // ── 행동. 여기가 두 화면이 갈리는 자리다.
    var act = el("div", "rs-actions");
    if (rec.hit) {
      // 진입점 4 — **맞힌 날에만**. 잔량이 이미 넉넉하면 권하지 않는다(핸드오프 원칙 7:
      // 한 세션에 최대 2회, 필요 없을 때 묻지 않는다).
      var cost = (typeof MSWallet !== "undefined" && MSWallet.COSTS) ? MSWallet.COSTS.full : null;
      MSWallet.get().then(function (w) {
        var bal = (w && w.ok && w.state) ? w.state.balance : null;
        if (bal != null && cost != null && bal < cost) {
          var ad = el("button", "btn btn-primary rs-ad", MSStr.t.rsAdToday);
          ad.addEventListener("click", function () { MSApp.go("report", { sym: sym }); });
          act.appendChild(ad);
        } else {
          var again = el("button", "btn btn-primary rs-again", MSStr.t.rsAgainToday);
          again.addEventListener("click", function () { MSApp.go("report", { sym: sym }); });
          act.appendChild(again);
        }
      })["catch"](function () {});
    } else {
      // 빗나간 날 — 광고 없음. 구체적 불만을 근거로 전문분석을 제안한다.
      var pro = el("button", "btn btn-outline rs-pro", MSStr.t.rsTryExpert);
      pro.addEventListener("click", function () { MSApp.go("report", { sym: sym }); });
      act.appendChild(pro);
    }
    var today = el("button", "btn btn-ghost rs-today", MSStr.t.rsTodayVerdict);
    today.addEventListener("click", function () { MSApp.go("report", { sym: sym }); });
    act.appendChild(today);
    scr.appendChild(act);

    scr.appendChild(el("p", "rs-disc", MSStr.t.rsDisclaimer));
    rootEl.appendChild(scr);
  }

  window.MSResult = { render: render, find: find };
})();
