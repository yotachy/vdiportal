/* 머니스쿱 앱 — 분석 실행 화면(기본·심화·커스텀 전체).
   원본: 프로토 run(L626~727) + 로직 dissection/03 §1~2 전문 승계.
   규칙: 스킵 없음 · 동시 1건(guardRun) · 대상 종목×주기 동결(runSym/runTf) · 중단=전액 반환
   (심화·커스텀만) · 원뿔 페이드인 basic 4 / 그 외 29 · 진행률 구간식(지표 94%→가중 96%→
   페르소나 98%→100%) · 특별 구간: deep 33틱(합성·보라)+영상 / custom 33 가중(보라)·34 페르소나
   (골드·pApply 시)+영상 · 영상 30s 타임아웃 · 이탈 시 3200ms 단축(bgWatch) · PiP 카드 2종.
   박자: 엔진 onStep 큐 + 결정적 리듬(24% 롱 880~1400ms / 76% 숏 230~500ms — 연출 상수). */
(function () {
  "use strict";
  const MS = (window.MS = window.MS || {});
  const str = MS.str;
  MS.reports = MS.reports || {};

  function beat(i) {
    const v = Math.sin(i * 91.7 + 57.3 + 7.3) * 43758.5453;
    const r = v - Math.floor(v);
    const v2 = Math.sin(i * 17.3 + 3.1) * 24631.4;
    const r2 = v2 - Math.floor(v2);
    return r > 0.76 ? (880 + r2 * 520) : (230 + r2 * 270);
  }
  function rnd(i, a) { const v = Math.sin(i * 91.7 + a * 57.3 + 7.3) * 43758.5453; return v - Math.floor(v); }
  const GC = { t: "var(--bl)", m: "var(--up)", v: "var(--cy)", q: "var(--am)", s: "var(--pk)" };
  const TIER_N = { basic: "기본", deep: "심화", custom: "커스텀" };

  let session = null;
  // session = { req, total, steps[], presented, phase:'ind'|'apply'|'persona'|'video'|'out',
  //             report, err, timer, vidT, host, candles, model, doneModel }

  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;"); }

  MS.runStart = function (req) {
    if (session) return;   // guardRun 이 막지만 이중 안전
    session = { req: req, total: req.tier === "basic" ? 5 : 32, steps: [], presented: 0,
      phase: "ind", report: null, err: null, timer: null, vidT: null, bgT: null,
      host: null, candles: null, model: null };
    MS.store.set({ runLive: 1, runSym: req.symbol, runTf: req.tfKo, tier: req.tier, prog: 0, runDoneN: null });
    MS.router.go("run");
    begin(req);
  };

  async function begin(req) {
    const s = session;
    try {
      const r = await MS.data.ohlc.fetch(req.symbol, req.tfKo);
      if (!s || s !== session) return;
      if (!r.ok) { fail("데이터를 불러오지 못했어요"); return; }
      s.candles = r.candles;
      paint();
      MS.engine.analyze({ symbol: req.symbol, tfKo: req.tfKo, tier: req.tier,
        preset: req.preset, weights: req.weights, personaApply: req.personaApply, candles: r.candles },
        function (step) { if (s === session) { s.steps.push(step); pump(); } })
        .then(function (report) { if (s === session) { s.report = report; pump(); } })
        .catch(function () { if (s === session) fail("엔진 계산에 실패했어요"); });
    } catch (e) { if (s === session) fail("데이터를 불러오지 못했어요"); }
  }

  function fail(msg) {
    const s = session;
    clearTimers();
    s.err = msg;
    // 실패 = 전액 반환(03 §1-9)
    if (s.req.paid) {
      MS.ui.hap("warn");
      MS.store.set(function (p) { return { scoops: p.scoops + s.req.paid }; });
      MS.store.persistSoon();
      MS.ui.flash("문제가 생겨 " + s.req.paid + "스쿱을 돌려드렸어요", "+" + s.req.paid);
      s.req.paid = 0;
    }
    paint();
  }

  function clearTimers() {
    const s = session;
    if (!s) return;
    if (s.timer) { clearTimeout(s.timer); s.timer = null; }
    if (s.vidT) { clearTimeout(s.vidT); s.vidT = null; }
    if (s.bgT) { clearInterval(s.bgT); s.bgT = null; }
  }

  function pump() {
    const s = session;
    if (!s || s.timer || s.err) return;
    if (s.phase === "ind" && s.presented < s.total && s.steps.length > s.presented) {
      s.timer = setTimeout(function () {
        if (s !== session) return;
        s.timer = null;
        s.presented++;
        MS.store.set({ prog: s.presented });
        paint();
        pump();
      }, beat(s.presented));
      return;
    }
    if (s.phase === "ind" && s.presented >= s.total && s.report) {
      if (s.req.tier === "basic") {
        s.timer = setTimeout(function () { if (s === session) { s.timer = null; finish(); } }, 900);
        paint();
        return;
      }
      // 특별 구간 진입(deep: 합성 / custom: 가중)
      s.phase = "apply";
      paint();
      if (s.req.tier === "custom" && s.req.personaApply) {
        s.timer = setTimeout(function () {
          if (s !== session) return;
          s.timer = null;
          s.phase = "persona";
          paint();
          enterVideo();
        }, 3300);
      } else {
        s.timer = setTimeout(function () {
          if (s !== session) return;
          s.timer = null;
          enterVideo();
        }, s.req.tier === "deep" ? 2600 : 1400);
      }
    }
  }

  function enterVideo() {
    const s = session;
    if (!s || s.err) return;
    s.phase = "video";
    paint();
    s.vidT = setTimeout(endApply, 30000);              // 영상 최대 30s(03 §1-6)
    s.bgT = setInterval(function () {                   // 이탈 감시 — away 면 3200ms 단축
      if (s !== session) { clearInterval(s.bgT); return; }
      if (MS.store.get().screen !== "run") {
        clearInterval(s.bgT); s.bgT = null;
        if (s.vidT) clearTimeout(s.vidT);
        s.vidT = setTimeout(endApply, 3200);
      }
    }, 400);
  }

  function endApply() {
    const s = session;
    if (!s) return;
    clearTimers();
    if (MS.store.get().screen !== "run") { finish(); return; }
    s.phase = "out";
    paint();
    s.timer = setTimeout(function () { if (s === session) { s.timer = null; finish(); } }, 1250);
  }

  function finish() {
    const s = session;
    if (!s) return;
    clearTimers();
    MS.ui.hap("done");
    const key = s.req.symbol + "|" + s.req.tfKo;
    const now = Date.now();
    s.report.at = now;
    MS.reports[key] = s.report;
    const st = MS.store.get();
    const analyzed = {}, analyzedAt = {};
    Object.keys(st.analyzed).forEach(function (k) { analyzed[k] = st.analyzed[k]; });
    Object.keys(st.analyzedAt).forEach(function (k) { analyzedAt[k] = st.analyzedAt[k]; });
    analyzed[key] = s.req.tier;
    analyzedAt[key] = now;
    const meta = {};
    Object.keys(st.analysisMeta || {}).forEach(function (k) { meta[k] = st.analysisMeta[k]; });
    meta[key] = { tier: s.req.tier, preset: s.req.preset || null,
      weights: s.req.weights || null, personaApply: !!s.req.personaApply };
    const away = st.screen !== "run" && !s.req.obFlow;
    MS.store.set({ runLive: 0, prog: 0, tier: null,
      analyzed: analyzed, analyzedAt: analyzedAt, analysisMeta: meta,
      runDoneN: away ? { sym: s.req.symbol, tf: s.req.tfKo } : null,
      ticker: away ? st.ticker : s.req.symbol, tf: away ? st.tf : s.req.tfKo,
      seg: s.req.tier === "basic" ? "evi" : "narr" });
    MS.store.persistSoon();
    const obFlow = s.req.obFlow;
    session = null;
    removePip();
    if (away) {
      MS.ui.flash(s.req.symbol + " 분석이 끝났어요 — 아래 카드를 눌러 결과 보기", "");
      renderDonePip();
      return;
    }
    MS.router.go(obFlow ? "obres" : "chart");
  }

  function cancelRun() {
    const s = session;
    if (!s || s.req.tier === "basic" || s.err) return;   // basic 은 중단 UI 없음
    clearTimers();
    const paid = s.req.paid || 0;
    if (paid) MS.store.set(function (p) { return { scoops: p.scoops + paid }; });
    MS.store.set({ runLive: 0, prog: 0, tier: null, runDoneN: null });
    MS.store.persistSoon();
    const from = s.req.from;
    session = null;
    removePip();
    if (paid) { MS.ui.hap("stop"); MS.ui.flash("중단했어요. " + paid + "스쿱을 돌려드렸습니다", "+" + paid); }
    else { MS.ui.hap("stop"); MS.ui.flash("중단했어요", ""); }
    MS.router.go(from === "score" ? "score" : "chart");
  }

  // ── 그리기 ──
  function paint() {
    const s = session;
    renderPip();
    if (!s || !s.host) return;
    const host = s.host;
    if (s.err) {
      host.innerHTML =
        '<div style="padding:60px 24px;text-align:center">' +
        '<div style="font-size:15px;font-weight:700;color:var(--dn)">' + s.err + "</div>" +
        '<div style="margin-top:8px;font-size:12.5px;color:var(--m1)">네트워크 상태를 확인한 뒤 다시 시도해 주세요.</div>' +
        '<div style="margin-top:20px;display:flex;flex-direction:column;gap:8px;max-width:260px;margin-left:auto;margin-right:auto">' +
        '<button class="ms-cta-primary" data-act="retry"><span class="t">다시 시도</span></button>' +
        '<button data-act="back" style="min-height:48px;border-radius:12px;border:1px solid var(--ln2);background:var(--sf2);color:var(--t1);font-size:14px;font-weight:600;cursor:pointer;font-family:inherit">돌아가기</button></div></div>';
      host.querySelector('[data-act="retry"]').addEventListener("click", function () {
        const req = s.req;
        // 재시도 = 재차감(03 §1-9 runRetry) — 유료였다면 잔액 확인
        const cost = req.tier === "deep" ? MS.config.POLICY.scoop.costDeep : req.tier === "custom" ? MS.config.POLICY.scoop.costCustom : 0;
        const st = MS.store.get();
        if (cost && !req.paid && st.scoops < cost) { session = null; MS.flow.openShort(req.tier); return; }
        if (cost && !req.paid) {
          MS.ui.hap("deduct");
          MS.store.set(function (p) { return { scoops: p.scoops - cost }; });
          req.paid = cost;
        }
        session = null;
        MS.runStart(req);
      });
      host.querySelector('[data-act="back"]').addEventListener("click", function () {
        MS.store.set({ runLive: 0, prog: 0, tier: null });
        session = null;
        removePip();
        MS.router.go(MS.store.get().picks.length ? "chart" : "pick");
      });
      return;
    }
    if (!s.candles) {
      host.innerHTML = '<div style="padding:60px 24px;text-align:center;font-size:13px;color:var(--m1)">' +
        esc(s.req.symbol) + " 실봉을 불러오는 중…</div>";
      return;
    }
    if (!s.model) s.model = MS.chart.build(s.candles, null, { frac: 0.82 });

    const tier = s.req.tier;
    const done = s.phase === "out";
    const special = s.phase === "apply" || s.phase === "persona" || s.phase === "video";
    const coneOn = s.presented >= (tier === "basic" ? 4 : 29);
    const cur = s.presented > 0 && s.presented <= s.steps.length ? s.steps[s.presented - 1] : null;

    // 진행률 구간식(03 §1-7): 지표 94% → 가중 96% → 페르소나 98% → 100%
    let pct;
    if (tier === "basic") pct = done ? 100 : Math.min(99, Math.round((Math.min(5, s.presented + 1) / 5) * 100));
    else if (s.phase === "ind") pct = Math.round(s.presented / 32 * 94);
    else if (s.phase === "apply") pct = 96;
    else if (s.phase === "persona") pct = 98;
    else if (s.phase === "video") pct = s.req.tier === "custom" && s.req.personaApply ? 98 : 96;
    else pct = 100;

    // 카메라 워크(프로토 runCamV — 결정적 3단, 영상 구간 제외)
    let camT = "";
    let camLabel = "";
    if (!special && !done) {
      const r0 = rnd(s.presented, 0);
      const hz = r0 < 0.24 ? 0 : r0 < 0.58 ? 1 : 2;
      camLabel = ["⤢ 장기 전체 조망", "중기 구간 관찰", "단기 구간 확대"][hz];
      if (hz === 1) camT = "scale(1.35) translate(-40px,-30px)";
      else if (hz === 2) camT = "scale(1.9) translate(-90px,-60px)";
    }

    // 차트: 완료 시 최종 합성(전 작도), 진행 중엔 그룹 순환 레이어
    let chartSvg;
    if (done && s.report) {
      if (!s.doneModel) s.doneModel = MS.chart.build(s.candles, s.report.prediction, {});
      chartSvg = MS.chart.svg(s.doneModel, { report: s.report, off: {}, deep: tier !== "basic",
        cone: true, coneBasic: tier === "basic", pred: true, p2: tier !== "basic", p3: tier === "custom", ma: true, boll: true });
    } else {
      const cyc = tier === "basic" ? (s.presented % 2) : (s.presented % 6);
      const layer = MS.chart.runLayer(s.model, s.report, cyc);
      const coneSvg = (coneOn && s.report && s.model) ? (function () {
        const cm = MS.chart.build(s.candles, s.report.prediction, { frac: 0.82 });
        return MS.chart.svg(cm, { cone: true, coneBasic: tier === "basic" });
      })() : null;
      chartSvg = coneSvg ||
        ('<svg viewBox="' + s.model.view + '" width="100%" height="396" preserveAspectRatio="xMidYMid meet" style="display:block">' +
          '<path d="' + s.model.wick + '" stroke="var(--m3)" stroke-width="1"/>' +
          '<path d="' + s.model.up + '" fill="var(--up)"/>' +
          '<path d="' + s.model.down + '" fill="var(--dn)"/>' +
          '<g style="animation:msDrawCycle 0.9s ease both">' + layer + "</g></svg>");
    }

    // 틱바: 32(+가중 33 보라·페르소나 34 골드 — 지표 아님)
    let ticks = "";
    for (let i = 0; i < s.total; i++) {
      const st2 = i < s.presented ? s.steps[i] : null;
      ticks += '<span style="flex:1;height:14px;border-radius:2px;background:' +
        (st2 ? GC[st2.group] : "var(--sf3)") + ";opacity:" + (st2 ? "1" : "0.55") + '"></span>';
    }
    if (tier !== "basic") {
      const applyOn = s.phase !== "ind";
      ticks += '<span style="flex:1.3;height:22px;border-radius:2px;background:' + (applyOn ? "#7b6cff" : "var(--sf3)") + (applyOn ? ";box-shadow:0 0 8px rgba(123,108,255,0.6)" : "") + '"></span>';
      if (tier === "custom" && s.req.personaApply) {
        const perOn = s.phase === "persona" || s.phase === "video" || s.phase === "out";
        ticks += '<span style="flex:1.3;height:22px;border-radius:2px;background:' + (perOn ? "var(--cu)" : "var(--sf3)") + (perOn ? ";box-shadow:0 0 8px rgba(210,165,22,0.6)" : "") + '"></span>';
      }
    }

    // 로그 4줄 슬라이딩 + 특별 구간 로그(03 §1-7)
    let logs = "";
    const from = Math.max(0, s.presented - (special || done ? 2 : 4));
    for (let i = from; i < s.presented; i++) {
      const t = s.steps[i];
      if (!t) continue;
      logs += '<div style="display:flex;gap:8px;font-size:11.5px;color:var(--m1);line-height:1.7">' +
        '<span style="color:' + GC[t.group] + ';flex:none">●</span>' +
        '<span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(t.name) + " — " + esc(t.text) + "</span></div>";
    }
    if (special || done) {
      logs += '<div style="display:flex;gap:8px;font-size:11.5px;color:var(--ac);line-height:1.7"><span style="flex:none">●</span><span>지표 ' + s.total + "개 계산 완료 · 1차 예측 확정</span></div>";
      if (tier === "custom") {
        const wl = [];
        const w = s.req.weights || {};
        Object.keys(w).forEach(function (k) { if (w[k] !== 1) wl.push((MS.engine.IND_META[k] ? MS.engine.IND_META[k].name : k) + " ×" + w[k]); });
        logs += '<div style="display:flex;gap:8px;font-size:11.5px;color:var(--ac);line-height:1.7"><span style="flex:none">●</span><span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">내 가중치 적용: ' + (wl.length ? esc(wl.join(" · ")) : "모두 ×1") + "</span></div>";
        if (s.req.personaApply && (s.phase === "persona" || s.phase === "video" || done))
          logs += '<div style="display:flex;gap:8px;font-size:11.5px;color:var(--cu);line-height:1.7"><span style="flex:none">●</span><span>페르소나 미세 조정 반영</span></div>';
      }
      if (tier === "deep") logs += '<div style="display:flex;gap:8px;font-size:11.5px;color:var(--ac);line-height:1.7"><span style="flex:none">●</span><span>가중 합성 · 2차 반대 시나리오 산출</span></div>';
    }

    const phaseLabel = s.phase === "ind" ? "지표 계산" : s.phase === "apply" ? "보정 · 가중치" :
      s.phase === "persona" ? "보정 · 페르소나" : s.phase === "video" ? "엔진 합성" : "완료";
    const curName = done ? "분석 완료" : special ? (s.phase === "apply" ? "가중치 합성 중" : s.phase === "persona" ? "페르소나 보정 중" : "엔진 마무리 합성") : (cur ? cur.name : "지표 계산 준비");

    const vidOn = s.phase === "video";
    const vidSrc = tier === "custom" ? "assets/engine-apply.mp4" : "assets/engine-deep.mp4";

    host.innerHTML =
      '<div style="position:absolute;inset:0;display:flex;flex-direction:column">' +
      '<div style="flex:1;min-height:0;position:relative;overflow:hidden">' +
      '<div style="position:absolute;inset:0;transform-origin:65% 40%;transition:transform 0.9s cubic-bezier(0.3,0.7,0.25,1);transform:' + (camT || "none") + '">' + chartSvg + "</div>" +
      '<span style="position:absolute;left:12px;top:12px;font-size:11px;color:var(--m1);border:1px solid var(--ln1);border-radius:99px;padding:4px 10px;background:rgba(var(--ovr),0.8)">' +
      esc(s.req.symbol) + " · " + esc(s.req.tfKo) + "봉 · " + TIER_N[tier] + " 분석</span>" +
      (camLabel ? '<span style="position:absolute;right:12px;top:12px;font-size:10.5px;color:var(--m2);border:1px solid var(--ln0);border-radius:99px;padding:3px 9px;background:rgba(var(--ovr),0.7)">' + camLabel + "</span>" : "") +
      (coneOn && !done && s.phase === "ind" ? '<span style="position:absolute;right:12px;bottom:10px;font-size:10.5px;color:var(--ac);animation:msVidIn 0.9s both">예측 원뿔 형성 중…</span>' : "") +
      "</div>" +
      '<div style="flex:none;border-top:1px solid var(--ln0);background:var(--sf0);padding:14px 16px calc(14px + env(safe-area-inset-bottom))">' +
      '<div style="display:flex;align-items:baseline;gap:8px">' +
      '<span style="font-size:13.5px;font-weight:700">' + esc(curName) + "</span>" +
      '<span style="font-size:11px;color:var(--m2)">' + phaseLabel + "</span>" +
      '<span class="mono" style="margin-left:auto;font-size:13px;color:' + (done ? "var(--up)" : "var(--ac)") + '">' + pct + "%</span></div>" +
      (cur && s.phase === "ind" ? '<div style="margin-top:4px;font-size:11.5px;color:var(--m1);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(cur.text) + "</div>" : "") +
      (done ? '<div style="margin-top:4px;font-size:11.5px;color:var(--up);animation:msVidIn 0.4s both">분석 완료 100% · 결과로 이동합니다</div>' : "") +
      '<div style="margin-top:10px;display:flex;gap:3px;align-items:flex-end">' + ticks + "</div>" +
      (tier !== "basic" ? '<div style="margin-top:5px;display:flex;gap:10px;font-size:9.5px;color:var(--m2)">' +
        '<span><span style="color:var(--bl)">●</span> 추세</span><span><span style="color:var(--up)">●</span> 모멘텀</span><span><span style="color:var(--cy)">●</span> 변동성</span><span><span style="color:var(--am)">●</span> 거래량</span><span><span style="color:var(--pk)">●</span> 구조</span>' +
        '<span style="margin-left:auto"><span style="color:#7b6cff">■</span> 가중' + (tier === "custom" && s.req.personaApply ? ' · <span style="color:var(--cu)">■</span> 페르소나' : "") + "</span></div>" : "") +
      '<div style="margin-top:8px;height:4px;border-radius:2px;background:var(--sf3);overflow:hidden">' +
      '<span style="display:block;height:100%;width:' + pct + "%;background:" + (done ? "var(--up)" : "var(--ac)") + ';transition:width 0.4s"></span></div>' +
      (vidOn ?
        '<div style="margin-top:10px;display:flex;gap:10px;align-items:center;border:1px solid var(--ln1);border-radius:10px;background:var(--sf1);padding:8px;animation:msVidIn 0.5s both">' +
        '<video src="' + vidSrc + '" autoplay muted playsinline style="width:104px;height:66px;object-fit:cover;border-radius:6px;flex:none" data-vid></video>' +
        '<div style="min-width:0"><div style="font-size:12.5px;font-weight:700">' + (tier === "custom" ? "가중치·페르소나 합성" : "심화 합성 마무리") + '</div><div style="margin-top:2px;font-size:11px;color:var(--m1)">엔진이 최종 예측을 굳히는 중</div></div></div>'
        : "") +
      '<div style="margin-top:10px;min-height:' + (special || done ? 50 : 66) + 'px">' + logs + "</div>" +
      '<div style="margin-top:6px;display:flex;align-items:center;gap:8px">' +
      '<span style="font-size:10.5px;color:var(--m2);min-width:0">실제 계산이 끝나야 결과가 열립니다 — 건너뛰기는 없어요</span>' +
      (tier !== "basic" && !done ? '<button data-act="cancel" style="margin-left:auto;flex:none;font-size:11.5px;color:var(--dn);border:1px solid rgba(255,92,122,0.4);border-radius:99px;padding:6px 14px;background:none;cursor:pointer;font-family:inherit">중단 · 전액 반환</button>' : "") +
      "</div></div></div>";

    const cb = host.querySelector('[data-act="cancel"]');
    if (cb) cb.addEventListener("click", cancelRun);
    const vid = host.querySelector("[data-vid]");
    if (vid) {
      vid.addEventListener("ended", endApply);
      vid.addEventListener("error", function () { if (session === s && s.phase === "video") endApply(); });
    }
  }

  // ── PiP 카드 2종(프로토 L1671~1686) ──
  function removePip() {
    const el = document.getElementById("msPip");
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }
  function renderPip() {
    const app = document.getElementById("msApp");
    if (!app) return;
    const st = MS.store.get();
    const s = session;
    if (s && !s.err && st.screen !== "run" && st.runLive) {
      let el = document.getElementById("msPip");
      if (!el) {
        el = document.createElement("div");
        el.id = "msPip";
        el.style.cssText = "position:absolute;right:12px;bottom:96px;z-index:45;display:flex;align-items:center;gap:9px;background:var(--sf2);border:1px solid var(--ln2);border-radius:13px;padding:9px 12px;cursor:pointer;box-shadow:0 12px 32px -8px rgba(0,0,0,0.6);animation:msRevealUp 0.4s cubic-bezier(0.2,0.9,0.3,1.15) both";
        el.addEventListener("click", function () {
          // 복귀 — 차트 컨텍스트도 분석 중 종목으로(03 §2-2)
          MS.store.set({ ticker: s.req.symbol, tf: s.req.tfKo });
          MS.router.go("run");
        });
        app.appendChild(el);
      }
      const tot = s.req.tier === "custom" ? (s.req.personaApply ? 34 : 33) : s.req.tier === "deep" ? 33 : 5;
      const prog = s.phase === "ind" ? s.presented : s.phase === "apply" ? s.total + 1 : tot;
      const pct = Math.min(99, Math.round(prog / tot * 100));
      const c = s.req.tier === "custom" ? "var(--cu)" : s.req.tier === "deep" ? "var(--ac)" : "var(--m1)";
      el.innerHTML =
        '<span style="width:7px;height:7px;border-radius:50%;background:' + c + ';animation:msPredPulse 1.1s ease-in-out infinite;flex:none"></span>' +
        '<span style="display:flex;flex-direction:column;gap:4px">' +
        '<span style="font-size:11.5px;font-weight:700;white-space:nowrap">' + esc(s.req.symbol) + " " + TIER_N[s.req.tier] + ' 분석 중 <span class="mono" style="color:' + c + '">' + pct + "%</span></span>" +
        '<span style="width:118px;height:3px;border-radius:2px;background:var(--sf3);overflow:hidden;display:block"><span style="display:block;height:100%;width:' + pct + "%;background:" + c + ';transition:width 0.4s"></span></span></span>' +
        '<span style="font-size:12px;color:var(--m2);flex:none">›</span>';
    } else if (!st.runDoneN) {
      removePip();
    }
  }
  function renderDonePip() {
    const app = document.getElementById("msApp");
    const st = MS.store.get();
    if (!app || !st.runDoneN) return;
    removePip();
    const el = document.createElement("div");
    el.id = "msPip";
    el.style.cssText = "position:absolute;right:12px;bottom:96px;z-index:45;display:flex;align-items:center;gap:9px;background:var(--sf2);border:1px solid rgba(46,217,160,0.55);border-radius:13px;padding:10px 13px;cursor:pointer;box-shadow:0 12px 32px -8px rgba(0,0,0,0.6),0 0 0 4px rgba(46,217,160,0.12);animation:msRevealUp 0.4s cubic-bezier(0.2,0.9,0.3,1.15) both";
    el.innerHTML =
      '<span style="width:18px;height:18px;border-radius:50%;background:rgba(46,217,160,0.16);border:1.5px solid var(--up);display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:800;color:var(--up);flex:none;animation:msPredPulse 1.6s ease-in-out infinite">✓</span>' +
      '<span style="font-size:12px;font-weight:700;white-space:nowrap">' + esc(st.runDoneN.sym) + ' 분석 완료 — <span style="color:var(--up)">결과 보기</span></span>';
    el.addEventListener("click", function () {
      const d = MS.store.get().runDoneN;
      MS.store.set({ runDoneN: null, ticker: d.sym, tf: d.tf || "일", seg: "narr" });
      removePip();
      MS.router.go("chart");
    });
    app.appendChild(el);
  }

  MS.router.register("run", {
    mount: function (host) {
      host.className = "ob-wrap";
      removePip();
      if (session) { session.host = host; paint(); }
      else {
        host.innerHTML = "";
        setTimeout(function () { MS.router.go(MS.store.get().picks.length ? "home" : "landing"); }, 0);
      }
    },
    unmount: function () {
      if (session) { session.host = null; renderPip(); }
    }
  });
})();
