// 분석 진행 중계(시안 19a). 지표를 하나씩 읽는 동안 그 진행을 그대로 중계한다.
//
// ⚠ **8b(해제 직후 전환 장면)와 같은 모듈이 될 수 없다.** 규칙이 정반대다(인벤토리 §0 충돌 8):
//   19a — 정직한 실시간 중계. 빠르면 빠르게 끝낸다. **최소 재생 시간이 없다.**
//   8b  — 이미 계산된 결과의 리워드 쇼. 서버가 더 빨라도 끝까지 재생한다.
// 이 파일에 MIN_MS 같은 상수가 생기는 순간 19a 는 거짓말을 시작한다. 관문이 그것을 잰다.
//
// **타이머로 흉내내지 않는다.** 진행 칸이 오르는 유일한 이유는 `stepper.step()` 이 실제로
// analyzeX 를 한 번 부른 것이다(MSIndicators.readingStepper). 프레임마다 예산만큼 읽고,
// 남으면 다음 프레임으로 넘긴다 — 화면이 멈추지 않으면서도 진행이 실제 계산을 따라간다.
// 그래서 캐시가 뜨거우면 한두 프레임에 끝나고, 그때는 그냥 한두 프레임 만에 끝난다.
//
// 여기서 읽은 행은 버리지 않고 onDone 으로 넘긴다. 연출을 위해 지표를 한 번 더 읽으면
// 그 비용은 사용자가 기다리는 시간이고, 화면이 보여준 값과 리포트가 쓰는 값이 갈라진다.
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else MSGlobals.define("MSAnalyzeView", factory());
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // 한 프레임에 쓸 계산 예산(ms). 지표 하나가 수 ms 라 여러 개가 한 프레임에 들어간다 —
  // 그래도 프레임을 넘기지 않아 탭 반응과 그리기가 살아 있다. 시간을 **쓰는** 상한이지
  // 시간을 **채우는** 하한이 아니다(그 차이가 19a 와 8b 를 가른다).
  var FRAME_BUDGET_MS = 8;

  // 순수 계산부 — 읽은 행들에서 화면이 말할 것을 뽑는다. DOM 도 타이머도 없이 시험할 수 있게
  // 갈라 둔다(8b 의 stateAt 과 같은 이유, 같은 자리를 공유하지는 않는다).
  function tallyOf(rows, eps) {
    var e = (typeof eps === "number") ? eps : 0.02;
    var t = { up: 0, flat: 0, down: 0 };
    for (var i = 0; i < rows.length; i++) {
      var b = rows[i].bias;
      if (typeof b !== "number") continue;
      if (b > e) t.up++;
      else if (b < -e) t.down++;
      else t.flat++;
    }
    return t;
  }

  function close() {
    var s = document.querySelector(".an-scrim");
    if (s && s.parentNode) s.parentNode.removeChild(s);
  }

  // opts = { stepper, basic, onDone(rows), onError(err) }
  //   stepper — MSIndicators.readingStepper 가 준 것. total/step()/drain()/done 을 갖는다.
  //   basic   — 기본 티어가 이미 읽던 수. 빗에서 스틸로 남는 칸(8b 와 같은 셈법).
  //   onError — 리뷰 I4(온보딩 6단계 재생 실패 사고). 실패해도 항상 부르는 게 아니다 —
  //             성공(onDone)과 실패(onError)는 서로 다른 결말이라 호출자가 갈라 처리해야
  //             한다(온보딩은 실패를 "재시도" 화면으로 떨어뜨린다, 절반만 읽은 rows 를
  //             onDone 처럼 완료로 취급하면 "32개 다 공개한다"는 약속이 거짓말이 된다).
  //             onError 를 안 준 호출자(report.js 구매 흐름, 이 라운드 범위 밖)는 기존과
  //             똑같이 onDone(그때까지 읽은 rows)으로 물러선다 — 무한 정지보다는 낫다.
  function play(opts) {
    var o = opts || {};
    var st = o.stepper;
    if (!st || !st.total) { if (o.onDone) o.onDone(st ? st.rows : []); return; }
    close();

    var raf = null, finished = false;

    // 리뷰 I4 — 예전엔 여기서 던지는 예외를 아무도 안 잡았다. play() 를 부르는 화면(온보딩)이
    // state.ob6Playing=true 를 먼저 세워 두므로, 던진 채 끝나면 그 플래그가 영원히 true 로
    // 남아 다음 draw() 마다 재생 함수가 조기 반환한다 — 뒤로가기 없는 단계라 앱이 그 자리에
    // 갇힌다. fail() 은 finish() 와 같은 정리(raf 취소·오버레이 제거)를 하되 onDone 대신
    // onError 로 보낸다 — 실패를 완료로 위장하지 않는다.
    function fail(err) {
      if (finished) return;
      finished = true;
      if (raf) cancelAnimationFrame(raf);
      close();
      if (o.onError) o.onError(err);
      else if (o.onDone) o.onDone(st.rows);
    }

    try {
      var total = st.total, basic = o.basic || 0;
      var scrim = MSUi.el("div", "an-scrim");
      var box = MSUi.el("div", "an-box");

      // ① 이미 끝난 단계를 먼저 말한다 — 사용자는 캔들을 이미 봤다(시안 19a 상단 배너).
      box.appendChild(MSUi.el("div", "an-done-banner", MSStr.t.anCandleDone));
      box.appendChild(MSUi.el("h2", "an-head", MSStr.t.anReading));

      var count = MSUi.el("div", "an-count", "");
      box.appendChild(count);

      var comb = MSUi.el("div", "an-comb");
      var teeth = [];
      for (var i = 0; i < total; i++) {
        var s = MSUi.el("div", "an-tooth" + (i < basic ? " an-core" : ""));
        comb.appendChild(s);
        teeth.push(s);
      }
      box.appendChild(comb);

      var track = MSUi.el("div", "an-track");
      var fill = MSUi.el("div", "an-fill");
      track.appendChild(fill);
      box.appendChild(track);

      var list = MSUi.el("div", "an-list");     // 최근 판독 3건
      box.appendChild(list);
      var tally = MSUi.el("div", "an-tally", "");
      box.appendChild(tally);
      box.appendChild(MSUi.el("div", "an-skip", MSStr.t.anSkip));
      scrim.appendChild(box);

      var paint = function () {
        var read = st.index;
        for (var i = 0; i < read && i < teeth.length; i++) teeth[i].classList.add("on");
        count.textContent = read + MSStr.t.anOf + total;
        fill.style.width = Math.round((read / total) * 100) + "%";
        var t = tallyOf(st.rows, MSIndicators.EPS);
        tally.textContent = MSStr.t.anTallyHead + t.up + MSStr.t.rpUp2 + t.flat + MSStr.t.rpFlat2 + t.down + MSStr.t.rpDown2;
        // 최근 3건만 남긴다 — 전부 쌓으면 스크롤이 생기고 그러면 이것은 목록이지 중계가 아니다.
        var recent = st.rows.slice(-3).reverse();
        list.innerHTML = "";
        recent.forEach(function (r, idx) {
          var row = MSUi.el("div", "an-row" + (idx > 0 ? " an-fade" + idx : ""));
          row.appendChild(MSUi.el("span", "an-row-name", MSStr.ind(r.type)));
          row.appendChild(MSUi.el("span", "an-row-text", r.text || ""));
          list.appendChild(row);
        });
      };

      var finish = function () {
        if (finished) return;
        finished = true;
        if (raf) cancelAnimationFrame(raf);
        close();
        if (o.onDone) o.onDone(st.rows);
      };

      // 탭하면 즉시 끝낸다. 남은 지표는 **버리지 않고 그 자리에서 마저 읽는다**(drain) —
      // 건너뛰기는 연출을 건너뛰는 것이지 분석을 건너뛰는 것이 아니다. 안 그러면 리포트가
      // 일부만 읽은 목록으로 "32개 중 24개"를 말하게 된다.
      scrim.addEventListener("click", function () {
        try { st.drain(); finish(); } catch (e) { fail(e); }
      });

      var frame = function () {
        // 리뷰 I4 — frame() 은 requestAnimationFrame 콜백이라 **호출 스택이 play() 와
        // 끊겨 있다.** play() 를 부르는 쪽(ob6Reveal)의 try/catch 는 이 함수 안에서 던지는
        // 예외를 원리적으로 못 잡는다 — 그래서 이 함수 자신이 잡아 fail() 로 보낸다. 이게
        // "rAF 콜백 안에서 던지는 경우도 같은 회수 경로를 타야 한다"(리뷰 지시)는 요구의
        // 실체다: 동기 실패(위 바깥 try)와 비동기 실패(여기)가 결국 같은 fail() 을 부른다.
        try {
          // 리뷰(Task 7) — 여기서 쓰던 `root` 는 팩토리 인자가 아니다(이 UMD 는 `factory()` 를
          // 인자 없이 부른다 — onboarding-quality.js 등 이 파일의 형제들과 같은 모양). 그래서
          // `root.performance` 는 실행되는 순간 "root is not defined" 로 던졌다 — play() 를 한
          // 번도 부른 적 없는 화면(온보딩)에서 처음 걸렸다. bench.js 가 이미 쓰는 안전한 관용구
          // (전역 performance 존재 확인)로 바꾼다 — root 라는 존재하지 않는 매개변수에 기대지 않는다.
          var hasPerf = typeof performance !== "undefined" && performance.now;
          var t0 = hasPerf ? performance.now() : 0;
          while (!st.done) {
            st.step();
            var t1 = hasPerf ? performance.now() : t0 + FRAME_BUDGET_MS + 1;
            if (t1 - t0 >= FRAME_BUDGET_MS) break;
          }
          paint();
          if (st.done) { finish(); return; }
          raf = requestAnimationFrame(frame);
        } catch (e) { fail(e); }
      };

      document.body.appendChild(scrim);
      paint();
      raf = requestAnimationFrame(frame);
    } catch (e) {
      fail(e);
    }
  }

  return { FRAME_BUDGET_MS: FRAME_BUDGET_MS, tallyOf: tallyOf, play: play, close: close };
});
