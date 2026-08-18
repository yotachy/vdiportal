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
// "동의 N / 전체 M" 은 판정이 이미 계산해 둔 confluence 를 그대로 쓴다 — 이 연출을 위해
// analyzeX 를 32번 더 돌리지 않는다(그 비용은 사용자가 기다리는 시간이다).
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

  function close() {
    var s = document.querySelector(".rv-scrim");
    if (s && s.parentNode) s.parentNode.removeChild(s);
  }

  // opts = { total, basic, agree, onDone }
  function play(opts) {
    var o = opts || {};
    var total = o.total, basic = o.basic;
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
      count.textContent = st.lit + MSStr.t.rvOf + total +
        (o.agree != null ? MSStr.t.rvSep + o.agree + MSStr.t.rvAgree : "");
      fill.style.width = Math.round(st.t * 100) + "%";
      if (st.done) { finish(); return; }
      raf = requestAnimationFrame(step);
    }

    document.body.appendChild(scrim);
    raf = requestAnimationFrame(step);
  }

  return { MIN_MS: MIN_MS, stateAt: stateAt, play: play, close: close };
});
