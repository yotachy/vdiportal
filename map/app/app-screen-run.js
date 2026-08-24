/* 머니스쿱 앱 — 분석 실행 화면 v1(basic).
   원본: 프로토 run(L626~727) + 로직 dissection/03 §1. P1 범위 = basic(5지표):
   스킵 없음·중단 UI 없음·영상 없음(심화·커스텀 전용 — P2). 원뿔 페이드인 prog>=4(03 §1-7).
   박자: 프로토는 420ms 데모 타이머 — 여기서는 엔진 onStep(실계산 완료)이 큐에 쌓이고,
   결정적 리듬(프로토 rnd 승계: 24% 롱 880~1400ms · 76% 숏 230~500ms)으로 소화한다.
   연출은 계산을 앞지르지 않는다(스텝이 안 왔으면 대기). 완료 기록은 runSym|runTf 동결본 기준. */
(function () {
  "use strict";
  const MS = (window.MS = window.MS || {});
  const str = MS.str;
  MS.reports = MS.reports || {};   // 'SYM|TF' → Report (메모리 — P2 에서 영속/재구성 계약 확정)

  // 프로토 L2240 결정적 스텝 리듬(연출 상수 — 정책 아님)
  function beat(i) {
    const v = Math.sin(i * 91.7 + 57.3 + 7.3) * 43758.5453;
    const r = v - Math.floor(v);
    const v2 = Math.sin(i * 17.3 + 3.1) * 24631.4;
    const r2 = v2 - Math.floor(v2);
    return r > 0.76 ? (880 + r2 * 520) : (230 + r2 * 270);
  }
  const GC = { t: "var(--bl)", m: "var(--up)", v: "var(--cy)", q: "var(--am)", s: "var(--pk)" };

  let session = null;   // { steps:[], presented, total, report, err, timer, host, candles, model, obFlow, sym, tfKo }

  MS.runStart = function (req) {
    session = { steps: [], presented: 0, total: 5, report: null, err: null, timer: null,
      host: null, candles: null, model: null, obFlow: !!req.obFlow, sym: req.symbol, tfKo: req.tfKo };
    MS.store.set({ runLive: 1, runSym: req.symbol, runTf: req.tfKo, tier: req.tier, prog: 0 });
    MS.router.go("run");
    begin(req);
  };

  async function begin(req) {
    const s = session;
    try {
      const r = await MS.data.ohlc.fetch(req.symbol, req.tfKo);
      if (!s || s !== session) return;
      if (!r.ok) { s.err = "데이터를 불러오지 못했어요"; paint(); return; }
      s.candles = r.candles;
      paint();
      MS.engine.analyze({ symbol: req.symbol, tfKo: req.tfKo, tier: req.tier, candles: r.candles },
        function (step) { if (s === session) { s.steps.push(step); pump(); } })
        .then(function (report) {
          if (s !== session) return;
          s.report = report;
          pump();
        })
        .catch(function () { if (s === session) { s.err = "엔진 계산에 실패했어요"; paint(); } });
    } catch (e) {
      if (s === session) { s.err = "데이터를 불러오지 못했어요"; paint(); }
    }
  }

  // 큐 소화 — 다음 스텝이 도착해 있으면 박자 후 표시, 전부 표시됐고 report 도착이면 완료
  function pump() {
    const s = session;
    if (!s || s.timer) return;
    if (s.presented < s.total && s.steps.length > s.presented) {
      s.timer = setTimeout(function () {
        if (s !== session) return;
        s.timer = null;
        s.presented++;
        MS.store.set({ prog: s.presented });
        paint();
        pump();
      }, beat(s.presented));
    } else if (s.presented >= s.total && s.report) {
      s.timer = setTimeout(function () {
        if (s !== session) return;
        s.timer = null;
        finish();
      }, 900);   // 완료 스탬프(100%) 잠깐 보여주고 전환
      paint();
    }
  }

  function finish() {
    const s = session;
    if (!s) return;
    MS.ui.hap("done");
    const key = s.sym + "|" + s.tfKo;
    const now = Date.now();
    s.report.at = now;
    MS.reports[key] = s.report;
    const st = MS.store.get();
    const analyzed = {}, analyzedAt = {};
    Object.keys(st.analyzed).forEach(function (k) { analyzed[k] = st.analyzed[k]; });
    Object.keys(st.analyzedAt).forEach(function (k) { analyzedAt[k] = st.analyzedAt[k]; });
    analyzed[key] = s.report.tier;
    analyzedAt[key] = now;
    const away = st.screen !== "run" && !s.obFlow;
    MS.store.set({ runLive: 0, prog: 0, analyzed: analyzed, analyzedAt: analyzedAt,
      ticker: away ? st.ticker : s.sym, tf: away ? st.tf : s.tfKo });
    MS.store.persistSoon();
    const obFlow = s.obFlow;
    session = null;
    if (away) { MS.ui.flash(s.sym + " 분석이 끝났어요 — 분석 탭에서 결과 보기", ""); return; }
    MS.router.go(obFlow ? "obres" : "chart");
  }

  function paint() {
    const s = session;
    if (!s || !s.host) return;
    const host = s.host;
    if (s.err) {
      host.innerHTML =
        '<div style="padding:60px 24px;text-align:center">' +
        '<div style="font-size:15px;font-weight:700;color:var(--dn)">' + s.err + "</div>" +
        '<div style="margin-top:8px;font-size:12.5px;color:var(--m1)">네트워크 상태를 확인한 뒤 다시 시도해 주세요.</div>' +
        '<button class="ms-cta-primary" data-act="back" style="margin-top:20px"><span class="t">돌아가기</span></button></div>';
      host.querySelector('[data-act="back"]').addEventListener("click", function () {
        MS.store.set({ runLive: 0, prog: 0, tier: null });
        session = null;
        MS.router.go(MS.store.get().picks.length ? "home" : "pick");
      });
      return;
    }
    if (!s.candles) {
      host.innerHTML = '<div style="padding:60px 24px;text-align:center;font-size:13px;color:var(--m1)">' +
        esc(s.sym) + " 실봉을 불러오는 중…</div>";
      return;
    }
    if (!s.model) s.model = MS.chart.build(s.candles, null, { frac: 0.82 });
    const done = s.presented >= s.total && s.report;
    const coneOn = s.presented >= 4;   // basic 원뿔 페이드인 지점(03 §1-7)
    const cur = s.presented > 0 ? s.steps[s.presented - 1] : null;
    const pct = done ? 100 : Math.min(99, Math.round((Math.min(5, s.presented + 1) / 5) * 100));
    // 진행 지표 작도 순환(P1: ma↔boll — msDrawCycle)
    const cyc = s.presented % 2;
    const chartSvg = MS.chart.svg(
      done && s.report ? MS.chart.build(s.candles, s.report.prediction, {}) : s.model,
      done ? { cone: true, coneBasic: true, pred: true, ma: true, boll: true }
           : { cone: coneOn && false, ma: cyc === 0, boll: cyc === 1 });

    let ticks = "";
    for (let i = 0; i < s.total; i++) {
      const st2 = i < s.presented ? s.steps[i] : null;
      ticks += '<span style="flex:1;height:14px;border-radius:3px;background:' +
        (st2 ? GC[st2.group] : "var(--sf3)") + ";opacity:" + (st2 ? "1" : "0.6") + '"></span>';
    }
    let logs = "";
    const from = Math.max(0, s.presented - 4);
    for (let i = from; i < s.presented; i++) {
      const t = s.steps[i];
      logs += '<div style="display:flex;gap:8px;font-size:11.5px;color:var(--m1);line-height:1.7">' +
        '<span style="color:' + GC[t.group] + ';flex:none">●</span>' +
        '<span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' +
        esc(t.name) + " — " + esc(t.text) + "</span></div>";
    }
    host.innerHTML =
      '<div style="position:absolute;inset:0;display:flex;flex-direction:column">' +
      '<div style="flex:1;min-height:0;position:relative;overflow:hidden">' +
      '<div style="position:absolute;inset:0;transition:opacity 0.9s;opacity:' + (coneOn || done ? 1 : 0.94) + '">' + chartSvg + "</div>" +
      '<span style="position:absolute;left:12px;top:12px;font-size:11px;color:var(--m1);border:1px solid var(--ln1);border-radius:99px;padding:4px 10px;background:rgba(var(--ovr),0.8)">' +
      esc(s.sym) + " · " + esc(s.tfKo) + "봉 · 기본 분석</span>" +
      (coneOn && !done ? '<span style="position:absolute;right:12px;bottom:10px;font-size:10.5px;color:var(--ac);animation:msVidIn 0.9s both">예측 원뿔 형성 중…</span>' : "") +
      "</div>" +
      '<div style="flex:none;border-top:1px solid var(--ln0);background:var(--sf0);padding:14px 16px calc(16px + env(safe-area-inset-bottom))">' +
      '<div style="display:flex;align-items:baseline;gap:8px">' +
      '<span style="font-size:13.5px;font-weight:700">' + (done ? "분석 완료" : cur ? esc(cur.name) : "지표 계산 준비") + "</span>" +
      '<span style="margin-left:auto;font-family:\'IBM Plex Mono\',monospace;font-size:13px;color:' + (done ? "var(--up)" : "var(--ac)") + '">' + pct + "%</span></div>" +
      (cur && !done ? '<div style="margin-top:4px;font-size:11.5px;color:var(--m1);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(cur.text) + "</div>" : "") +
      (done ? '<div style="margin-top:4px;font-size:11.5px;color:var(--up);animation:msVidIn 0.4s both">지표 5개 계산 완료 · 예측 확정</div>' : "") +
      '<div style="margin-top:10px;display:flex;gap:4px">' + ticks + "</div>" +
      '<div style="margin-top:8px;height:4px;border-radius:2px;background:var(--sf3);overflow:hidden">' +
      '<span style="display:block;height:100%;width:' + pct + "%;background:" + (done ? "var(--up)" : "var(--ac)") + ';transition:width 0.4s"></span></div>' +
      '<div style="margin-top:10px;min-height:66px">' + logs + "</div>" +
      '<div style="margin-top:6px;font-size:10.5px;color:var(--m2)">실제 계산이 끝나야 결과가 열립니다 — 건너뛰기는 없어요</div>' +
      "</div></div>";
  }

  function esc(s2) { return String(s2 == null ? "" : s2).replace(/&/g, "&amp;").replace(/</g, "&lt;"); }

  MS.router.register("run", {
    mount: function (host) {
      host.className = "ob-wrap";
      if (session) { session.host = host; paint(); }
      else {
        // 직접 진입(비정상) — 홈으로
        host.innerHTML = "";
        setTimeout(function () { MS.router.go(MS.store.get().picks.length ? "home" : "landing"); }, 0);
      }
    },
    unmount: function () { if (session) session.host = null; }
  });
})();
