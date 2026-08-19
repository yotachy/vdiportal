// 해제 직후 전환 장면(시안 8b). 광고나 결제로 심화가 열린 **직후**, 이미 계산이 끝난 결과를
// 보여주기 전에 3초간 재생하는 축하 연출이다.
//
// ⚠ **19a(분석 진행 중계)와 같은 모듈이 될 수 없다.** 규칙이 정반대다(인벤토리 §0 충돌 8):
//   19a — 정직한 실시간 중계. 캐시로 0.3초에 끝나면 0.3초에 끝낸다. **늘리지 않는다.**
//   8b  — 이미 계산된 결과의 리워드 쇼. 서버가 더 빨라도 **끝까지 재생한다.**
// 한 컴포넌트에 mode 플래그를 넣는 순간 둘 중 하나의 규칙이 조용히 다른 쪽에 샌다.
// 그래서 파일을 나눈다. 공유해도 되는 것은 빗 그리기 정도이고 타이밍 정책은 공유하지 않는다.
//
// 숫자는 지어내지 않는다. 빗 칸 수는 엔진의 지표 수, 스틸 칸은 기본 티어가 읽는 수에서 온다.
// 동의·반대·무판정 세 통(§3.6)은 MSReportModel.verdict() 가 이미 합 검산까지 해서 돌려준
// 값을 호출부(report.js)가 그대로 넘긴다 — 이 연출을 위해 analyzeX 를 32번 더 돌리거나
// 세 값을 여기서 다시 집계하지 않는다(그 비용은 사용자가 기다리는 시간이고, 두 곳에서
// 집계하면 검산이 갈라져도 아무도 못 잡는다).
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else MSGlobals.define("MSReveal", factory());
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var MIN_MS = 3000;   // 시안 8b — 짧아지지 않는다. 길어지지도 않는다.

  // 순수 계산부. 시간과 총 개수를 주면 그 시점의 상태를 돌려준다 —
  // 시험이 DOM 도 타이머도 없이 타이밍 계약을 잴 수 있게 하려고 갈라 둔 것이다.
  function stateAt(elapsed, total, basic) {
    var t = Math.max(0, Math.min(1, elapsed / MIN_MS));
    var lit = Math.round(basic + (total - basic) * t);
    return { t: t, lit: Math.max(basic, Math.min(total, lit)), done: elapsed >= MIN_MS };
  }

  // 세 통(동의·반대·무판정) — 받은 값을 그대로 실어 나른다. 여기서 다시 계산하지 않는
  // 이유는 MSReportModel.verdict() 가 이미 합 검산을 마친 값이기 때문이다(report-model.js
  // §verdict 주석) — 8b 가 스스로 재집계하면 검산이 두 곳으로 갈라져 어긋나도 아무도 못
  // 잡는다. total 을 명시로 안 주면 세 값의 합으로 유도한다(옛 호출부 호환 — agree 하나만
  // 오던 시절엔 total 이 별도 인자였다).
  function revealState(o) {
    var agree = (o && typeof o.agree === "number") ? o.agree : 0;
    var dissent = (o && typeof o.dissent === "number") ? o.dissent : 0;
    var noDir = (o && typeof o.noDir === "number") ? o.noDir : 0;
    var total = (o && typeof o.total === "number") ? o.total : (agree + dissent + noDir);
    return { agree: agree, dissent: dissent, noDir: noDir, total: total };
  }

  function bucketCell(cls, n, label) {
    var cell = MSUi.el("div", "rv-bucket " + cls);
    cell.appendChild(MSUi.el("span", "rv-bucket-num", String(n)));
    cell.appendChild(MSUi.el("span", "rv-bucket-label", label));
    return cell;
  }
  // 동의·반대·무판정 세 통(설계서 §3.6) — 합이 위 rv-count 의 카운터와 일치해야 한다
  // (revealState 가 만든 값을 그대로 쓰므로 여기서 어긋날 방법이 없다).
  function buildBuckets(bs) {
    var wrap = MSUi.el("div", "rv-buckets");
    wrap.appendChild(bucketCell("is-agree", bs.agree, MSStr.t.rvAgree));
    wrap.appendChild(bucketCell("is-dissent", bs.dissent, MSStr.t.rvDissent));
    wrap.appendChild(bucketCell("is-nodir", bs.noDir, MSStr.t.rvNoDir));
    return wrap;
  }

  function close() {
    var s = document.querySelector(".rv-scrim");
    if (s && s.parentNode) s.parentNode.removeChild(s);
  }

  // opts = { total, basic, agree, dissent, noDir, onDone }
  function play(opts) {
    var o = opts || {};
    var total = o.total, basic = o.basic;
    var bs = revealState(o);   // 세 통(동의·반대·무판정) — verdict() 가 이미 검산한 값
    close();

    var scrim = MSUi.el("div", "rv-scrim");
    var box = MSUi.el("div", "rv-box");
    box.appendChild(MSUi.el("div", "overline", MSStr.t.rvCaption));
    box.appendChild(MSUi.el("h2", "rv-head", (total - basic) + MSStr.t.rvOpened));

    var comb = MSUi.el("div", "rv-comb");
    var teeth = [];
    for (var i = 0; i < total; i++) {
      var s = MSUi.el("div", "rv-tooth" + (i < basic ? " rv-core" : ""));
      comb.appendChild(s);
      teeth.push(s);
    }
    box.appendChild(comb);

    // 세 통을 빗 바로 아래 둔다 — 빗이 "무엇이 열렸는지"를 보여주면 세 통은 "그중 몇 개가
    // 동의·반대·무판정인지"를 바로 이어 말한다. 진행 비율(rv-count)은 그 아래 진행바
    // (rv-track)와 짝이라 그 위에 붙인다.
    //
    // 스코프 캡션(P1b Task 10, G2 이월 폴리시 P1) — 바로 위 헤드라인(rv-head)은
    // total−basic("새로 열린 수", 예: 27)을 말하고 세 통의 합은 total("전체 모집단",
    // 예: 32)이다. 둘 다 자기 스코프에서 옳지만 나란히 있으면 "27개 열렸다면서 왜
    // 합이 32냐"로 읽힌다(Task 7 리뷰가 이월한 범위 밖 관찰). 숫자를 바꾸는 대신 세
    // 통이 무엇의 합인지를 이름으로 적는다 — bs.total 은 revealState() 가 agree+
    // dissent+noDir 로 검산해 둔 값이라 여기서 다시 셀 필요가 없다.
    box.appendChild(MSUi.el("div", "rv-buckets-scope", MSStr.t.rvBucketsScopeA + bs.total + MSStr.t.rvBucketsScopeB));
    box.appendChild(buildBuckets(bs));
    var count = MSUi.el("div", "rv-count", "");
    box.appendChild(count);
    var track = MSUi.el("div", "rv-track");
    var fill = MSUi.el("div", "rv-fill");
    track.appendChild(fill);
    box.appendChild(track);
    box.appendChild(MSUi.el("div", "rv-skip", MSStr.t.rvSkip));
    scrim.appendChild(box);

    var start = null, raf = null, finished = false;
    function finish() {
      if (finished) return;
      finished = true;
      if (raf) cancelAnimationFrame(raf);
      close();
      if (o.onDone) o.onDone();
    }
    // 탭하면 즉시 끝낸다 — 두 화면의 공통 규칙이다(연출을 강제로 앉혀두지 않는다).
    scrim.addEventListener("click", finish);

    function step(now) {
      if (start == null) start = now;
      var st = stateAt(now - start, total, basic);
      for (var i = 0; i < teeth.length; i++) {
        if (i < st.lit) teeth[i].classList.add("on");
      }
      count.textContent = st.lit + MSStr.t.rvOf + total;
      fill.style.width = Math.round(st.t * 100) + "%";
      if (st.done) { finish(); return; }
      raf = requestAnimationFrame(step);
    }

    document.body.appendChild(scrim);
    raf = requestAnimationFrame(step);
  }

  return { MIN_MS: MIN_MS, stateAt: stateAt, revealState: revealState, play: play, close: close };
});
