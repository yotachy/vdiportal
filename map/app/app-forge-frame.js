/* 머니스쿱 앱 — 포지 차트 프레임(forge.html?embed=app 을 iframe 으로 실행하는 단일 브리지).
   차트·작도·시연은 전부 프레임 안의 PC 코드가 그린다(사본 없음 — 설계 docs/superpowers/specs/2026-08-25-app-forge-embed.md).
   iframe 은 앱 수명 동안 하나만 만들어 화면(분석·실행) 사이를 옮겨 다닌다(재로드 없음).
   프로토콜: 앱→프레임 {src:"moneyscoop-app", type, ...} · 프레임→앱 {src:"forge-embed", type, ...}.
   프레임 URL 은 서버 절대 경로(엔진과 같은 규칙) — 로컬 dev(fixture)에서도 프로덕션 forge 를 연다(로컬 PHP 는 시세 프록시 불가). */
(function () {
  "use strict";
  const MS = (window.MS = window.MS || {});
  const PROD_BASE = "https://parksvc.mycafe24.com/map";
  const READY_TIMEOUT = 25000, RESULT_TIMEOUT = 30000, PLAY_TIMEOUT = 60000;

  let iframe = null, ready = false, readyWaiters = [];
  let resultWaiter = null, playWaiter = null, stepCb = null;
  const listeners = {};

  function base() {
    if (MS.data && MS.data.devMode) return PROD_BASE;
    const b = MS.data ? MS.data.serverBase() : "..";
    return b;
  }

  function ensure() {
    if (iframe) return iframe;
    iframe = document.createElement("iframe");
    iframe.className = "ms-forge-frame";
    iframe.setAttribute("title", "스쿱 엔진 차트");
    iframe.setAttribute("allow", "fullscreen");
    iframe.style.cssText = "display:block;width:100%;height:100%;border:0;background:var(--sf0)";
    const th = (MS.store && MS.store.get().theme === "light") ? "daylight" : "midnight";
    iframe.src = base() + "/forge.html?embed=app&th=" + th + "&v=20260829j";
    window.addEventListener("message", onMessage);
    return iframe;
  }

  function onMessage(ev) {
    const m = ev.data; if (!m || m.src !== "forge-embed") return;
    if (m.type === "ready") {
      ready = true;
      const th = (MS.store && MS.store.get().theme === "light") ? "daylight" : "midnight";
      post({ type: "theme", key: th });
      readyWaiters.splice(0).forEach(function (f) { f(); });
    } else if (m.type === "result") {
      if (resultWaiter) { const w = resultWaiter; resultWaiter = null; clearTimeout(w.t); w.res(m); }
    } else if (m.type === "step") {
      if (stepCb) stepCb(m);
    } else if (m.type === "done" || m.type === "stopped") {
      if (playWaiter) { const w = playWaiter; playWaiter = null; clearTimeout(w.t); w.res({ done: m.type === "done" }); }
    } else if (m.type === "error") {
      if (resultWaiter) { const w = resultWaiter; resultWaiter = null; clearTimeout(w.t); w.res({ ok: false, error: m.msg }); }
      if (playWaiter) { const w = playWaiter; playWaiter = null; clearTimeout(w.t); w.res({ done: false, error: m.msg }); }
    }
    (listeners[m.type] || []).forEach(function (f) { try { f(m); } catch (e) {} });
  }

  function post(msg) {
    if (!iframe || !iframe.contentWindow) return;
    msg.src = "moneyscoop-app";
    try { iframe.contentWindow.postMessage(msg, "*"); } catch (e) {}
  }

  function whenReady() {
    ensure();
    if (ready) return Promise.resolve();
    return new Promise(function (res, rej) {
      const t = setTimeout(function () { rej(new Error("forge-frame ready timeout")); }, READY_TIMEOUT);
      readyWaiters.push(function () { clearTimeout(t); res(); });
    });
  }

  // ── 오버레이 배치: iframe 은 #msApp 에 한 번만 붙이고(재부모화=재로드 — 절대 옮기지 않는다),
  //    화면이 준 자리표시자(placeholder)의 사각형 위에 절대 배치로 얹는다. 스크롤·리사이즈를 따라간다.
  let ph = null, ro = null, rafT = null;
  function appEl() { return document.getElementById("msApp") || document.body; }
  function sync() {
    rafT = null;
    if (!iframe || !ph || !ph.isConnected) { if (iframe) iframe.style.display = "none"; return; }
    const a = appEl().getBoundingClientRect(), r = ph.getBoundingClientRect();
    // rect 는 시각 px, style 은 #msApp(zoom 1.12 일 수 있음) 안의 CSS px — 나누지 않으면 확대 상태에서
    // 프레임이 12% 크게·아래로 놓여 차트 하단이 탭바 밑으로 들어간다(2026-08-29 사용자 제보).
    const z = (MS.ui && MS.ui.zoomOf) ? MS.ui.zoomOf() : 1;
    iframe.style.display = "block";
    iframe.style.left = ((r.left - a.left) / z) + "px";
    iframe.style.top = ((r.top - a.top) / z) + "px";
    iframe.style.width = (r.width / z) + "px";
    iframe.style.height = (r.height / z) + "px";
  }
  function schedule() { if (!rafT) rafT = requestAnimationFrame(sync); }
  function attach(placeholder) {
    ensure();
    if (iframe.parentNode !== appEl()) {
      iframe.style.cssText = "position:absolute;left:0;top:0;width:100%;height:396px;border:0;z-index:6;background:var(--sf0);display:none";
      appEl().appendChild(iframe);
      window.addEventListener("resize", schedule);
      document.addEventListener("scroll", schedule, true);   // 화면(.ms-screen) 스크롤은 캡처로 잡는다
    }
    ph = placeholder;
    if (ro) ro.disconnect();
    if (window.ResizeObserver) { ro = new ResizeObserver(schedule); ro.observe(ph); }
    sync();
    return iframe;
  }
  function detach() {
    ph = null;
    if (ro) { ro.disconnect(); ro = null; }
    if (iframe) iframe.style.display = "none";
  }

  const TF_TO = { "일": "1day", "주": "1week", "월": "1month" };

  // 종목·주기·티어·가중치 로드 → 결과(verdict·prediction) 도착까지
  function load(req) {
    return whenReady().then(function () {
      return new Promise(function (res) {
        if (resultWaiter) { clearTimeout(resultWaiter.t); resultWaiter.res({ ok: false, error: "superseded" }); }
        const t = setTimeout(function () { resultWaiter = null; res({ ok: false, error: "timeout" }); }, RESULT_TIMEOUT);
        resultWaiter = { res: res, t: t };
        post({ type: "load", symbol: req.symbol, tf: TF_TO[req.tf] || req.tf || "1day", tier: req.tier || "basic",
          weights: req.weights || null, evidence: req.evidence !== false, confirmed: !!req.confirmed,
          draft: !!req.draft, evidenceOff: req.evidenceOff || null });
      });
    });
  }

  // 시연(손그림 작도) — step 콜백 + 완료 Promise
  function play(onStep) {
    return whenReady().then(function () {
      return new Promise(function (res) {
        stepCb = onStep || null;
        const t = setTimeout(function () { playWaiter = null; stepCb = null; res({ done: false, error: "timeout" }); }, PLAY_TIMEOUT);
        playWaiter = { res: function (r) { stepCb = null; res(r); }, t: t };
        post({ type: "play" });
      });
    });
  }

  function stop() { post({ type: "stop" }); }
  function setTF(tf) { return whenReady().then(function () { post({ type: "tf", tf: TF_TO[tf] || tf }); }); }
  function evidence(opts) { whenReady().then(function () { post(Object.assign({ type: "evidence" }, opts)); }); }
  function fit() { whenReady().then(function () { post({ type: "fit" }); }); }
  function theme(key) { whenReady().then(function () { post({ type: "theme", key: key }); }); }
  function on(type, fn) { (listeners[type] = listeners[type] || []).push(fn); }

  MS.forgeFrame = { attach: attach, detach: detach, sync: schedule, load: load, play: play, stop: stop,
    setTF: setTF, evidence: evidence, fit: fit, theme: theme, on: on, isReady: function () { return ready; } };
})();
