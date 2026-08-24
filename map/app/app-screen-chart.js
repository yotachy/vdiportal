/* 머니스쿱 앱 — 분석(종목 상세) 화면.
   원본: 프로토 chart L333~624 + 작도 시트 L2058~2081 + 로직 dissection/03.
   P2 완성: 판정 deep 확장(합의·국면·기회 칩 — 엔진 context 실값) · 세그 4탭 전체 ·
   작도 토글 시트(N/32·indOff 영속·코치마크 1회) · 2/3차 예측선+범례 · 오실레이터 배지 ·
   핀치 줌+드래그 팬(버튼 없음 — 웹과 동일 감각) · FAB→단계 선택 시트 · 24h 만료 3태.
   재방문 시 리포트가 메모리에 없으면 analysisMeta 로 동일 파라미터 재계산(무료·결정적). */
(function () {
  "use strict";
  const MS = (window.MS = window.MS || {});
  const str = MS.str;
  const TIER_C = { basic: "#8b93a7", deep: "#7b6cff", custom: "var(--cu)" };
  const GC = { t: "var(--bl)", m: "var(--up)", v: "var(--cy)", q: "var(--am)", s: "var(--pk)" };

  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;"); }
  function fmtPrice(v) {
    if (v == null || !isFinite(v)) return "—";
    return v >= 1000 ? Math.round(v).toLocaleString("en-US") : (Math.round(v * 100) / 100).toFixed(2);
  }

  function mount(host) {
    let candles = null, quote = null, rebuilding = false;
    let zoom = 1, panX = 0, panY = 0;   // 핀치·팬(세션 휘발)

    function key() { const s = MS.store.get(); return s.ticker + "|" + s.tf; }
    function report() { return MS.reports[key()] || null; }

    async function load() {
      const s = MS.store.get();
      if (!s.ticker) { MS.router.go("home"); return; }
      candles = null; zoom = 1; panX = 0; panY = 0;
      render();
      try {
        const r = await MS.data.ohlc.fetch(s.ticker, s.tf);
        if (MS.store.get().screen !== "chart") return;
        if (!r.ok) { candles = "err"; render(); return; }
        candles = r.candles;
        quote = MS.data.quote(r.candles);
        maybeRebuild(r.candles);
        render();
      } catch (e) { candles = "err"; render(); }
    }

    // 기록 있음 + 리포트 없음(리로드) → 저장된 파라미터로 동일 재계산(무료·결정적)
    function maybeRebuild(cds) {
      const s = MS.store.get();
      const k = key();
      if (!s.analyzed[k] || MS.reports[k] || rebuilding) return;
      rebuilding = true;
      const meta = (s.analysisMeta && s.analysisMeta[k]) || { tier: s.analyzed[k] };
      MS.engine.analyze({ symbol: s.ticker, tfKo: s.tf, tier: meta.tier || s.analyzed[k],
        preset: meta.preset, weights: meta.weights, personaApply: meta.personaApply, candles: cds })
        .then(function (rep) {
          rep.at = s.analyzedAt[k] || Date.now();
          MS.reports[k] = rep;
          rebuilding = false;
          if (MS.store.get().screen === "chart") render();
        }).catch(function () { rebuilding = false; });
    }

    function statusChip() {
      const s = MS.store.get();
      const t = s.analyzed[key()];
      const at = s.analyzedAt[key()];
      const P = MS.config.POLICY.analysis;
      if (t && at) {
        const leftMs = P.ttlMs - (Date.now() - at);
        const h = Math.ceil(leftMs / 3600000);
        if (leftMs < P.warnMs) return { txt: "곧 만료 — " + Math.max(1, Math.floor(leftMs / 60000)) + "분 남음", fg: "var(--am)", bd: "rgba(255,176,32,0.5)", dash: "solid" };
        return { txt: (t === "basic" ? "기본" : t === "deep" ? "심화" : "커스텀") + " 분석 · " + h + "시간 남음", fg: TIER_C[t], bd: TIER_C[t], dash: "solid" };
      }
      if (at && !t) return { txt: "만료 — 다시 분석", fg: "var(--am)", bd: "rgba(255,176,32,0.5)", dash: "dashed" };
      return { txt: "미확정", fg: "var(--m1)", bd: "var(--ln2)", dash: "dashed" };
    }

    function drawCount() {
      const s = MS.store.get();
      const rep = report();
      if (!rep) return null;
      const total = rep.indicators.length;
      let onN = 0;
      rep.indicators.forEach(function (ind) { if (!s.indOff[ind.id]) onN++; });
      return { on: onN, total: total };
    }

    function render() {
      const s = MS.store.get();
      const rep = report();
      const tier = s.analyzed[key()] || null;
      const v = rep ? rep.verdict : null;
      const master = MS.data.MASTER.filter(function (t) { return t.sym === s.ticker; })[0];
      const chip = statusChip();
      const seg = s.seg || "evi";
      const deepTier = tier === "deep" || tier === "custom";
      const dc = drawCount();

      let chartHtml;
      if (candles === "err") {
        chartHtml = '<div style="height:396px;display:flex;align-items:center;justify-content:center;font-size:13px;color:var(--dn)">시세를 불러오지 못했어요</div>';
      } else if (!candles) {
        chartHtml = '<div style="height:396px;display:flex;align-items:center;justify-content:center;font-size:13px;color:var(--m1)">실봉 불러오는 중…</div>';
      } else {
        const model = MS.chart.build(candles, rep ? rep.prediction : null, {});
        const off = s.indOff || {};
        const inner = MS.chart.svg(model, rep ? {
          report: rep, off: off, deep: deepTier,
          cone: !off.__cone, coneBasic: tier === "basic", pred: !off.__p1,
          p2: deepTier && !off.__p2, p3: tier === "custom" && !off.__p2,
          ma: true, boll: true
        } : {});
        chartHtml =
          '<div data-zoom style="position:relative;overflow:hidden;touch-action:none;height:396px">' +
          '<div data-zoominner style="transform-origin:0 0;height:100%">' + inner + "</div>" +
          (!rep ? '<span style="position:absolute;left:50%;top:46%;transform:translate(-50%,-50%);font-size:12px;color:var(--m1);border:1px dashed var(--ln2);border-radius:99px;padding:6px 14px;background:rgba(var(--ovr),0.85);white-space:nowrap">분석 전 — 예측 없음</span>' : "") +
          (rep && dc ?
            '<button data-act="draws" style="position:absolute;left:10px;top:10px;display:flex;align-items:center;gap:6px;font-size:11px;color:var(--t1);border:1px solid var(--ln1);border-radius:99px;padding:5px 11px;background:rgba(var(--ovr),0.85);cursor:pointer;font-family:inherit;animation:' + (!s.coachDone ? "msRing 1.8s ease-out infinite" : "none") + '">' +
            '<span style="display:flex;gap:2px"><span style="width:8px;height:2px;background:var(--bl);border-radius:1px;margin-top:4px"></span><span style="width:8px;height:2px;background:var(--cy);border-radius:1px;margin-top:4px"></span><span style="width:8px;height:2px;background:var(--cu);border-radius:1px;margin-top:4px"></span></span>' +
            "작도 " + dc.on + "/" + dc.total + ' <span style="color:var(--m1)">지표별 보기·숨기기</span> ›</button>' : "") +
          (rep && deepTier ?
            '<div style="position:absolute;right:10px;bottom:26px;display:flex;flex-direction:column;gap:3px;font-size:9.5px;background:rgba(var(--ovr),0.82);border:1px solid var(--ln0);border-radius:8px;padding:6px 9px;pointer-events:none">' +
            '<span style="color:var(--ac)">— 1차 종합</span><span style="color:var(--cy)">--- 2차 반대 시나리오</span>' +
            (tier === "custom" ? '<span style="color:var(--cu)">--- 3차 가중치·페르소나</span>' : "") + "</div>" : "") +
          (rep && deepTier ? '<span style="position:absolute;right:10px;bottom:6px;font-size:9.5px;color:var(--m2);pointer-events:none">신뢰지평 · 멀어질수록 확률 낮아짐</span>' : "") +
          "</div>" +
          (rep ? MS.chart.badgeHtml(rep, s.indOff) : "");   // 오실레이터 배지 — 차트 아래(오버레이 금지)
      }

      const dirTxt = v ? (v.dir === "up" ? "▲ 상승" : v.dir === "down" ? "▼ 하락" : "— 중립") : "분석 전";
      const dirC = v ? (v.dir === "up" ? "var(--up)" : v.dir === "down" ? "var(--dn)" : "var(--t2)") : "var(--m1)";
      const ctx = v && v.context;
      const regimeTxt = ctx ? (ctx.state === "range" ? "횡보 국면" : ctx.state === "up" ? "상승추세" : "하락추세") +
        " · 신뢰 " + (ctx.reliability === "high" ? "높음" : ctx.reliability === "mid" ? "중간" : "낮음") : null;
      const opp = ctx && ctx.opportunity;
      const oppTxt = opp ? (opp.sub === "support" ? "지지 반등 기회 [검증됨]" : "하락 후 반등 기회 [검증됨]") : null;

      host.innerHTML =
        '<div class="ms-chart-layout" style="padding-bottom:110px"><div class="ms-chart-left">' +
        '<div style="display:flex;align-items:center;gap:8px;padding:12px 16px 0">' +
        '<button data-act="back" aria-label="홈으로" style="width:32px;height:32px;display:flex;align-items:center;justify-content:center;background:none;border:0;color:var(--m1);cursor:pointer;flex:none"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"></path></svg></button>' +
        '<span data-act="stocks" style="display:flex;align-items:baseline;gap:6px;cursor:pointer;min-width:0">' +
        '<span style="font-size:16px;font-weight:700">' + esc(s.ticker) + "</span>" +
        '<span style="font-size:12.5px;color:var(--m1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(master ? master.name : "") + " ▾</span></span>" +
        '<span style="margin-left:auto;text-align:right">' +
        '<span class="mono" style="display:block;font-size:14px;font-weight:600">' + (quote ? fmtPrice(quote.price) : "—") + "</span>" +
        (quote ? '<span class="mono" style="display:block;font-size:11.5px;font-weight:700;color:' + (quote.up ? "var(--up)" : "var(--dn)") + '">' + (quote.up ? "▲" : "▼") + Math.abs(quote.chg).toFixed(2) + "%</span>" : "") +
        "</span></div>" +
        '<div style="display:flex;align-items:center;gap:8px;padding:12px 16px 0">' +
        '<div style="display:flex;gap:4px;background:var(--sf1);border-radius:9px;padding:3px">' +
        ["일", "주", "월"].map(function (tf) {
          const on = s.tf === tf;
          const t2 = s.analyzed[s.ticker + "|" + tf];
          return '<button data-tf="' + tf + '" style="position:relative;min-width:44px;padding:7px 10px;border-radius:7px;border:0;cursor:pointer;font-family:inherit;font-size:12.5px;font-weight:' + (on ? 700 : 500) + ";color:" + (on ? "var(--t1)" : "var(--m1)") + ";background:" + (on ? "var(--sf3)" : "transparent") + '">' + tf +
            (t2 ? '<span style="position:absolute;right:4px;top:4px;width:5px;height:5px;border-radius:50%;background:' + TIER_C[t2] + '"></span>' : "") + "</button>";
        }).join("") + "</div>" +
        '<button data-act="chip" style="margin-left:auto;font-size:11.5px;color:' + chip.fg + ";border:1px " + chip.dash + " " + chip.bd + ';border-radius:99px;padding:5px 12px;white-space:nowrap;background:none;cursor:pointer;font-family:inherit">' + chip.txt + "</button></div>" +
        '<div style="margin-top:8px">' + chartHtml + "</div></div>" +
        '<div class="ms-chart-right">' +

        // 판정 블록
        '<div style="padding:16px 16px 0;position:relative;overflow:hidden">' +
        (v ? '<span style="position:absolute;left:0;top:0;bottom:0;width:38%;background:linear-gradient(100deg,transparent,rgba(123,108,255,0.07),transparent);animation:msSweepX 1.4s ease-out 0.25s both;pointer-events:none"></span>' : "") +
        '<div style="display:flex;align-items:baseline;gap:12px">' +
        '<span style="font-size:25px;font-weight:700;color:' + dirC + ';letter-spacing:-0.02em;display:inline-block;' + (v ? "animation:msVerdictPop 0.6s cubic-bezier(0.2,0.8,0.3,1.2) 0.18s both" : "") + '">' + dirTxt + "</span>" +
        (v && deepTier ? '<span class="mono" style="font-size:18px;font-weight:600">' + v.agree + "/" + v.totalInd + '<span style="font-size:13px;color:var(--t2)"> 합의</span></span>' : "") +
        '<span class="mono" style="margin-left:auto;font-size:15px">' + (quote ? fmtPrice(quote.price) : "") + "</span></div>" +
        (v ?
          '<div style="margin-top:12px;display:flex;align-items:center;gap:8px">' +
          '<span class="mono" style="font-size:13px;color:var(--dn)">▼' + (100 - v.prob) + "</span>" +
          '<div style="flex:1;position:relative;height:9px;border-radius:5px;background:var(--sf3)">' +
          '<div style="position:absolute;left:0;top:0;bottom:0;width:' + v.prob + '%;border-radius:5px;background:linear-gradient(90deg,var(--updeep),var(--up))"></div>' +
          '<div style="position:absolute;left:60.96%;top:-3px;bottom:-3px;width:2px;background:var(--ac)"></div></div>' +
          '<span class="mono" style="font-size:13px;color:var(--up)">▲' + v.prob + "</span></div>" +
          '<div style="margin-top:4px;text-align:right;font-size:11.5px;color:var(--ac)">세로 표시 = 시장 평균 60.96%</div>' +
          (deepTier && (regimeTxt || oppTxt) ?
            '<div style="margin-top:12px;display:flex;flex-wrap:wrap;gap:8px">' +
            (regimeTxt ? '<span style="font-size:13px;color:var(--t1);border:1px solid var(--ln2);border-radius:99px;padding:4px 12px;background:var(--sf2)">' + regimeTxt + "</span>" : "") +
            (oppTxt ? '<span style="font-size:13px;color:var(--ac);border:1px solid rgba(123,108,255,0.3);border-radius:99px;padding:4px 12px;background:rgba(123,108,255,0.1)">' + oppTxt + "</span>" : "") + "</div>" : "") +
          '<div style="margin-top:12px;font-size:13.5px;color:var(--t1)">지표 ' + v.totalInd + "개 중 " + v.agree + "개가 같은 방향을 봅니다 · 상승 확률 " + v.prob + "%</div>" +
          '<div style="margin-top:4px;font-size:13px;color:var(--t2);line-height:1.55">현재가 기준 목표 ' + fmtPrice(v.target) + " · " + fmtPrice(v.invalid) + " 아래로 내려가면 이 예측은 접습니다</div>" +
          '<div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:4px 16px;font-size:13px;color:var(--t2)">' +
          "<span>예상 범위 <b style=\"color:var(--t1)\">" + fmtPrice(v.rangeLo) + " ~ " + fmtPrice(v.rangeHi) + "</b></span>" +
          "<span>목표 <b style=\"color:var(--t1)\">" + fmtPrice(v.target) + "</b></span></div>" +
          (deepTier ? '<div style="margin-top:12px;border:1px solid rgba(46,217,160,0.25);border-radius:9px;background:rgba(46,217,160,0.05);padding:8px 12px;font-size:13px;color:var(--t2)"><b style="color:var(--up)">다음 마감 후</b> 자동 채점 · 결과는 「채점」 탭에서 확인</div>'
            : '<div style="margin-top:12px;border-radius:10px;background:var(--sf2);padding:8px 12px;font-size:13px;color:var(--m1)">기본 분석은 채점하지 않아요. 기록은 심화·커스텀부터 남습니다</div>')
        :
          '<div style="margin-top:12px;border:1px dashed var(--ln2);border-radius:9px;padding:12px">' +
          '<div style="font-size:13.5px;font-weight:600">아직 분석 전이에요</div>' +
          '<div style="margin-top:4px;font-size:13px;color:var(--m1);line-height:1.6">방향·범위·목표는 분석 후에 열려요 · 기본 분석은 무료</div></div>'
        ) + "</div>" +

        // basic 업셀 + 잠금 행
        (tier === "basic" ?
          '<div style="margin:16px 16px 0;border:1px solid rgba(123,108,255,0.3);border-radius:12px;background:rgba(123,108,255,0.1);padding:12px 16px">' +
          '<div style="display:flex;align-items:center;gap:8px"><span style="font-size:13.5px;font-weight:700">지금 결과는 기본 분석입니다</span><span style="font-size:12.5px;color:var(--t2);border:1px solid var(--ln2);border-radius:99px;padding:2px 8px">도구 ' + MS.engine.basicSet().length + '개</span></div>' +
          '<div style="margin-top:4px;font-size:13px;color:var(--t2);line-height:1.6">방향과 예상 범위까지 확인했어요. <b style="color:var(--t1)">' + MS.engine.indicatorCount() + '개 도구가 왜 그렇게 봤는지</b>는 심화에서 열립니다.</div>' +
          '<div data-act="tier" style="margin-top:12px;height:48px;border-radius:9px;background:linear-gradient(135deg,#7b6cff,#4a3ce0);display:flex;align-items:center;justify-content:center;gap:8px;cursor:pointer"><span style="font-size:13.5px;font-weight:700;color:#fff">심화로 더 깊이</span><span class="mono" style="font-size:13px;color:rgba(255,255,255,0.85)">◈ ' + MS.config.POLICY.scoop.costDeep + "</span></div></div>" +
          '<div style="margin:16px 16px 0;border:1px solid var(--ln0);border-radius:14px;overflow:hidden">' +
          ["확신도(합의 상세)", "세 시점 예측", "반대 의견", "지표 해설 " + MS.engine.indicatorCount() + "개"].map(function (n) {
            return '<div data-act="tier" style="display:flex;align-items:center;gap:8px;padding:12px;border-bottom:1px solid var(--ln0);cursor:pointer">' +
              '<span style="font-size:13.5px;color:var(--t3)">' + n + "</span>" +
              '<span style="font-size:11.5px;color:var(--ac);border:1px solid rgba(123,108,255,0.3);border-radius:4px;padding:1px 8px">심화</span>' +
              '<span class="mono" style="margin-left:auto;font-size:13px;color:var(--m2)">—</span></div>';
          }).join("") +
          '<div data-act="tier" style="padding:12px;font-size:13px;color:var(--ac);background:var(--sf1);cursor:pointer">눌러서 열기 · 심화 ◈ ' + MS.config.POLICY.scoop.costDeep + "</div></div>"
          : "") +

        // 세그 탭
        '<div style="display:flex;gap:4px;padding:16px 12px 8px;margin-top:8px">' +
        [["evi", "근거"], ["hz", "시점별"], ["ind", "지표"], ["narr", "해설"]].map(function (t) {
          const on = seg === t[0];
          return '<button data-seg="' + t[0] + '" style="flex:1;text-align:center;padding:8px 0;font-size:13px;font-weight:' + (on ? 700 : 500) + ";color:" + (on ? "var(--t1)" : "var(--m1)") + ";background:" + (on ? "var(--sf2)" : "transparent") + ";border:1px solid " + (on ? "var(--ln2)" : "transparent") + ';border-radius:7px;cursor:pointer;font-family:inherit">' + t[1] + "</button>";
        }).join("") + "</div>" +
        '<div style="padding:0 16px 12px;border-bottom:1px solid var(--sf3);font-size:12.5px;color:var(--m1)">' +
        (seg === "evi" ? "무엇을 보고 이렇게 판단했는지" : seg === "hz" ? "시점별로 어디까지 가는지" : seg === "ind" ? "지표들이 가리키는 방향" : "사람 말로 풀어낸 결론") + "</div>" +
        segBody(rep, tier, seg) +
        '<div style="margin:16px;font-size:11px;color:var(--m2);line-height:1.7">' +
        (candles && candles !== "err" ? "실봉 " + candles.length.toLocaleString("en-US") + "개 계산 · " : "") +
        "시세는 지연될 수 있어요 · 예측은 참고용이며 투자 판단과 책임은 본인에게 있습니다.</div>" +
        "</div></div>";

      renderFab(tier);
      bind(rep, tier);
      applyZoom();
    }

    // FAB — 앱 프레임(#msApp) 내부 absolute(뷰포트 fixed 금지 — 프레임 밖 이탈 사고 2026-08-24)
    function renderFab(tier) {
      removeFab();
      const app = document.getElementById("msApp");
      if (!app) return;
      const fab = document.createElement("button");
      fab.id = "msFab";
      fab.className = "ms-press";
      fab.style.cssText = "position:absolute;right:16px;bottom:96px;z-index:30;height:48px;border-radius:99px;border:0;padding:0 20px;background:linear-gradient(135deg,#7b6cff,#4a3ce0);color:#fff;font-size:13.5px;font-weight:700;font-family:inherit;box-shadow:0 10px 26px -10px rgba(123,108,255,0.8);cursor:pointer;transition:transform 0.3s";
      fab.textContent = tier ? "다시 분석" : "분석하기";
      fab.setAttribute("data-act", "fab");
      fab.setAttribute("aria-label", tier ? "다시 분석" : "분석하기");
      fab.addEventListener("click", function () {
        if (MS.guardRun && MS.guardRun()) return;
        MS.flow.openTier();
      });
      app.appendChild(fab);
    }
    function removeFab() {
      const f = document.getElementById("msFab");
      if (f && f.parentNode) f.parentNode.removeChild(f);
    }
    mount._removeFab = removeFab;

    function segBody(rep, tier, seg) {
      if (!rep) return '<div style="padding:20px 16px;font-size:13px;color:var(--m1)">분석하면 여기에 근거가 채워져요.</div>';
      const deepTier = tier === "deep" || tier === "custom";
      const v = rep.verdict;
      if (seg === "evi") {
        const sorted = rep.indicators.slice().sort(function (a, b) { return b.strength - a.strength; });
        return '<div style="padding:12px 16px 0">' +
          '<div style="display:flex;align-items:baseline;gap:8px"><span style="font-size:13.5px;font-weight:600">지표 신호</span><span style="font-size:12.5px;color:var(--m1)">' + sorted.length + "개 · 강도순</span></div>" +
          sorted.map(function (g) {
            const arrow = g.bias > 0.05 ? "▲" : g.bias < -0.05 ? "▼" : "–";
            const c = g.bias > 0.05 ? "var(--up)" : g.bias < -0.05 ? "var(--dn)" : "var(--m1)";
            return '<div style="display:flex;gap:8px;padding:12px 0;border-bottom:1px solid var(--ln0);align-items:flex-start">' +
              '<span class="mono" style="color:' + c + ';font-size:13px;width:13px">' + arrow + "</span>" +
              '<div style="flex:1;min-width:0"><div style="display:flex;align-items:center;gap:6px"><span style="font-size:13.5px;font-weight:600">' + esc(g.name) + '</span><span style="width:6px;height:6px;border-radius:2px;background:' + GC[g.group] + ';opacity:0.7"></span></div>' +
              '<div style="font-size:13px;color:var(--t2);line-height:1.5">' + esc(g.text) + "</div></div>" +
              '<div style="width:60px;flex:none;padding-top:4px"><div style="height:5px;border-radius:3px;background:var(--sf3)"><div style="width:' + g.strength + "%;height:5px;border-radius:3px;background:" + c + '"></div></div></div></div>';
          }).join("") + "</div>";
      }
      if (seg === "hz") {
        if (!deepTier) return lockCard("세 시점 예측");
        const anchor = rep.prediction.anchor;
        return '<div style="padding:12px 16px 0">' +
          rep.horizons.map(function (h) {
            const span = h.hi - h.lo || 1;
            const dotL = Math.max(0, Math.min(100, (h.price - h.lo) / span * 100));
            const nowL = Math.max(0, Math.min(100, (anchor - h.lo) / span * 100));
            const c = h.chg >= 0 ? "var(--up)" : "var(--dn)";
            return '<div style="display:flex;align-items:center;gap:10px;padding:11px 0;border-bottom:1px solid var(--ln0)">' +
              '<span class="mono" style="width:52px;flex:none;font-size:12.5px;color:var(--t2)">' + h.label + "</span>" +
              '<div style="flex:1;position:relative;height:8px;border-radius:4px;background:var(--sf3)">' +
              '<span style="position:absolute;left:' + nowL + '%;top:-3px;bottom:-3px;width:1.5px;background:var(--m2)"></span>' +
              '<span style="position:absolute;left:' + dotL + '%;top:50%;width:9px;height:9px;border-radius:50%;background:' + c + ';transform:translate(-50%,-50%);box-shadow:0 0 6px ' + c + '"></span></div>' +
              '<span class="mono" style="width:64px;flex:none;text-align:right;font-size:12.5px;font-weight:600">' + fmtPrice(h.price) + "</span>" +
              '<span class="mono" style="width:52px;flex:none;text-align:right;font-size:12px;color:' + c + '">' + (h.chg >= 0 ? "+" : "") + h.chg.toFixed(1) + "%</span>" +
              '<span class="mono" style="width:40px;flex:none;text-align:right;font-size:12px;color:var(--ac)">' + h.prob + "%</span></div>";
          }).join("") +
          '<div style="margin-top:8px;font-size:11.5px;color:var(--m2)">막대 = 예상 범위 · ● 예측가 · | 현재가 · 우측 = 상승 확률(멀수록 낮아져요)</div></div>';
      }
      if (seg === "ind") {
        const sorted = rep.indicators.slice().sort(function (a, b) { return Math.abs(b.bias) - Math.abs(a.bias); });
        const show = sorted.slice(0, deepTier ? 18 : 6);
        const rest = sorted.length - show.length;
        return '<div style="padding:12px 16px 0">' +
          (deepTier ? '<div style="font-size:12.5px;color:var(--m1)">합의 ' + v.agree + "/" + v.totalInd + " · 강도순 상위 " + show.length + "개</div>" : "") +
          show.map(function (g) {
            const pct = Math.round(50 + Math.max(-1, Math.min(1, g.bias)) * 50);
            return '<div style="display:flex;align-items:center;gap:8px;padding:8px 0">' +
              '<span style="width:96px;flex:none;font-size:12.5px;color:var(--t2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(g.name) + "</span>" +
              '<div style="flex:1;position:relative;height:7px;border-radius:4px;background:var(--sf3)">' +
              '<span style="position:absolute;left:50%;top:-2px;bottom:-2px;width:1px;background:var(--ln2)"></span>' +
              (pct >= 50
                ? '<span style="position:absolute;left:50%;width:' + (pct - 50) + '%;top:0;bottom:0;background:var(--up);border-radius:0 4px 4px 0"></span>'
                : '<span style="position:absolute;right:50%;width:' + (50 - pct) + '%;top:0;bottom:0;background:var(--dn);border-radius:4px 0 0 4px"></span>') +
              "</div>" +
              '<span class="mono" style="width:36px;flex:none;text-align:right;font-size:11.5px;color:var(--m1)">' + (g.bias >= 0 ? "+" : "") + (Math.round(g.bias * 100) / 100) + "</span></div>";
          }).join("") +
          (rest > 0 ? '<div style="margin-top:6px;font-size:11.5px;color:var(--m2)">나머지 ' + rest + "개는 방향 기여가 작아요</div>" : "") + "</div>";
      }
      // narr — 해설
      if (!deepTier) return lockCard("지표 해설");
      const oppDir = v.dir === "up" ? -1 : 1;
      const oppList = rep.indicators.filter(function (g) { return oppDir > 0 ? g.bias > 0.05 : g.bias < -0.05; })
        .sort(function (a, b) { return Math.abs(b.bias) - Math.abs(a.bias); }).slice(0, 5);
      return '<div style="padding:12px 16px 0">' +
        '<div style="font-size:13.5px;color:var(--t1);line-height:1.8">' +
        "지표 " + v.totalInd + "개 중 <b>" + v.agree + "개</b>가 서로 다른 근거로 같은 방향을 가리킵니다. " +
        (v.dir === "up" ? "상승" : v.dir === "down" ? "하락" : "중립") + " 확률 <b>" + v.prob + "%</b> · 목표 <b>" + fmtPrice(v.target) + "</b> · " +
        "<b>" + fmtPrice(v.invalid) + "</b> 아래로 내려가면 이 예측은 접습니다.</div>" +
        (oppList.length ?
          '<div style="margin-top:12px;border:1px solid rgba(255,92,122,0.3);border-radius:10px;background:rgba(255,92,122,0.05);padding:10px 12px">' +
          '<div style="font-size:12.5px;font-weight:700;color:var(--dn)">반대 의견 — ' + oppList.length + "개 지표</div>" +
          oppList.map(function (g) {
            return '<div style="margin-top:6px;font-size:12.5px;color:var(--t2);line-height:1.5"><b style="color:var(--t1)">' + esc(g.name) + "</b> — " + esc(g.text) + "</div>";
          }).join("") + "</div>" : "") +
        '<div style="margin-top:14px;font-size:13px;font-weight:600">지표별 해설 ' + rep.indicators.length + "개</div>" +
        '<div style="margin-top:6px;display:flex;flex-direction:column;gap:6px">' +
        rep.indicators.map(function (g) {
          const c = g.bias > 0.05 ? "var(--up)" : g.bias < -0.05 ? "var(--dn)" : "var(--m1)";
          return '<details style="border:1px solid var(--ln0);border-radius:9px;background:var(--sf1);padding:9px 12px">' +
            '<summary style="cursor:pointer;font-size:13px;font-weight:600;display:flex;align-items:center;gap:8px;list-style:none">' +
            '<span class="mono" style="color:' + c + '">' + (g.bias > 0.05 ? "▲" : g.bias < -0.05 ? "▼" : "–") + "</span>" + esc(g.name) +
            '<span style="margin-left:auto;font-size:11px;color:var(--m2)">강도 ' + g.strength + "</span></summary>" +
            '<div style="margin-top:6px;font-size:12.5px;color:var(--t2);line-height:1.6">' + esc(g.text) + "</div></details>";
        }).join("") + "</div></div>";
    }

    function lockCard(name) {
      return '<div data-act="tier" style="margin:16px;border:1px dashed var(--ln2);border-radius:12px;padding:20px 16px;text-align:center;cursor:pointer">' +
        '<div style="font-size:13.5px;font-weight:600;color:var(--t3)">' + name + "은 심화부터</div>" +
        '<div style="margin-top:6px;font-size:12.5px;color:var(--m1)">심화 분석(◈ ' + MS.config.POLICY.scoop.costDeep + ")에서 열립니다</div></div>";
    }

    // ── 작도 토글 시트(프로토 L2058~2081) ──
    function openDraws() {
      const rep = report();
      if (!rep) return;
      MS.store.set({ coachDone: 1 });
      MS.ui.openSheet("draws", function (body) {
        function paintSheet() {
          const s = MS.store.get();
          const dc = drawCount();
          body.innerHTML =
            '<div style="display:flex;align-items:center;gap:8px;padding:4px 0 10px">' +
            '<span style="font-size:16px;font-weight:700">차트에 그릴 작도</span>' +
            '<span class="mono" style="font-size:12.5px;color:var(--ac)">' + dc.on + "/" + dc.total + "</span>" +
            '<button data-all="on" style="margin-left:auto;font-size:11.5px;color:var(--t2);border:1px solid var(--ln2);border-radius:99px;padding:4px 10px;background:none;cursor:pointer;font-family:inherit">모두 켜기</button>' +
            '<button data-all="off" style="font-size:11.5px;color:var(--t2);border:1px solid var(--ln2);border-radius:99px;padding:4px 10px;background:none;cursor:pointer;font-family:inherit">모두 끄기</button></div>' +
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">' +
            rep.indicators.map(function (ind) {
              const offd = !!s.indOff[ind.id];
              return '<button data-tog="' + ind.id + '" style="display:flex;align-items:center;gap:8px;min-height:44px;padding:0 12px;border-radius:10px;border:1px solid ' + (offd ? "var(--ln0)" : "var(--ln2)") + ";background:" + (offd ? "transparent" : "var(--sf2)") + ";opacity:" + (offd ? 0.5 : 1) + ';cursor:pointer;font-family:inherit;letter-spacing:inherit;text-align:left">' +
                '<span style="width:9px;height:9px;border-radius:2px;background:' + GC[ind.group] + ';flex:none"></span>' +
                '<span style="font-size:12.5px;font-weight:600;color:var(--t1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0">' + esc(ind.name) + "</span>" +
                '<span style="margin-left:auto;font-size:12px;color:' + (offd ? "var(--m2)" : "var(--up)") + ';flex:none">' + (offd ? "－" : "✓") + "</span></button>";
            }).join("") + "</div>" +
            '<div style="margin:10px 0 4px;font-size:11.5px;color:var(--m2)">● 선·밴드형은 차트에 그려지고, 수치형은 배지로 표시돼요 · 끈 지표도 계산에는 그대로 들어갑니다</div>';
          body.querySelectorAll("[data-tog]").forEach(function (b) {
            b.addEventListener("click", function () {
              const id = b.getAttribute("data-tog");
              const s2 = MS.store.get();
              const off = {};
              Object.keys(s2.indOff).forEach(function (k) { off[k] = s2.indOff[k]; });
              if (off[id]) delete off[id]; else off[id] = 1;
              MS.store.set({ indOff: off });
              MS.store.persistSoon();
              const dc0 = MS.store.get().dayCounters;
              if (dc0.drawXp < MS.config.POLICY.xp.drawToggle.perDay) {
                const dc2 = {};
                Object.keys(dc0).forEach(function (kk) { dc2[kk] = dc0[kk]; });
                dc2.drawXp++;
                MS.store.set({ dayCounters: dc2 });
                setTimeout(function () { MS.xp.add(MS.config.POLICY.xp.drawToggle.xp, "작도 조작"); }, 350);
              }
              paintSheet(); render();
            });
          });
          body.querySelectorAll("[data-all]").forEach(function (b) {
            b.addEventListener("click", function () {
              const mode = b.getAttribute("data-all");
              const off = {};
              if (mode === "off") rep.indicators.forEach(function (ind) { off[ind.id] = 1; });
              MS.store.set({ indOff: off });
              MS.store.persistSoon();
              paintSheet(); render();
            });
          });
        }
        paintSheet();
      });
    }

    // ── 핀치 줌 + 드래그 팬(버튼 없음 — 웹과 동일 감각) ──
    function applyZoom() {
      const inner = host.querySelector("[data-zoominner]");
      if (inner) inner.style.transform = "translate(" + panX + "px," + panY + "px) scale(" + zoom + ")";
    }
    function bindZoom() {
      const wrap = host.querySelector("[data-zoom]");
      if (!wrap) return;
      let pDist = null, pMid = null, pPan = null;
      wrap.addEventListener("touchstart", function (e) {
        if (e.touches.length === 2) {
          const dx = e.touches[0].clientX - e.touches[1].clientX, dy = e.touches[0].clientY - e.touches[1].clientY;
          pDist = Math.sqrt(dx * dx + dy * dy);
          pMid = { x: (e.touches[0].clientX + e.touches[1].clientX) / 2, y: (e.touches[0].clientY + e.touches[1].clientY) / 2 };
        } else if (e.touches.length === 1 && zoom > 1) {
          pPan = { x: e.touches[0].clientX - panX, y: e.touches[0].clientY - panY };
        }
      }, { passive: true });
      wrap.addEventListener("touchmove", function (e) {
        if (e.touches.length === 2 && pDist) {
          const dx = e.touches[0].clientX - e.touches[1].clientX, dy = e.touches[0].clientY - e.touches[1].clientY;
          const d = Math.sqrt(dx * dx + dy * dy);
          const nz = Math.max(1, Math.min(3, zoom * d / pDist));
          const r = wrap.getBoundingClientRect();
          const mx = pMid.x - r.left, my = pMid.y - r.top;
          panX = mx - (mx - panX) * nz / zoom;
          panY = my - (my - panY) * nz / zoom;
          zoom = nz;
          pDist = d;
          clampPan(wrap);
          applyZoom();
        } else if (e.touches.length === 1 && pPan && zoom > 1) {
          panX = e.touches[0].clientX - pPan.x;
          panY = e.touches[0].clientY - pPan.y;
          clampPan(wrap);
          applyZoom();
        }
      }, { passive: true });
      wrap.addEventListener("touchend", function (e) {
        if (e.touches.length < 2) pDist = null;
        if (!e.touches.length) pPan = null;
        if (zoom <= 1.02) { zoom = 1; panX = 0; panY = 0; applyZoom(); }
      });
      let lastTap = 0;
      wrap.addEventListener("touchend", function () {   // 더블탭 = 리셋
        const now = Date.now();
        if (now - lastTap < 300) { zoom = 1; panX = 0; panY = 0; applyZoom(); }
        lastTap = now;
      });
    }
    function clampPan(wrap) {
      const r = wrap.getBoundingClientRect();
      panX = Math.min(0, Math.max(r.width * (1 - zoom), panX));
      panY = Math.min(0, Math.max(r.height * (1 - zoom), panY));
    }

    function bind(rep, tier) {
      host.querySelector('[data-act="back"]').addEventListener("click", function () { MS.router.go("home"); });
      host.querySelectorAll("[data-tf]").forEach(function (b) {
        b.addEventListener("click", function () {
          MS.store.set({ tf: b.getAttribute("data-tf") });
          load();
        });
      });
      host.querySelectorAll("[data-seg]").forEach(function (b) {
        b.addEventListener("click", function () {
          const sc = host.scrollTop;
          MS.store.set({ seg: b.getAttribute("data-seg") });
          render();
          host.scrollTop = sc;   // 세그 전환 시 스크롤 유지(지침서 §5)
        });
      });
      host.querySelectorAll('[data-act="tier"]').forEach(function (b) {
        b.addEventListener("click", function () { MS.flow.openTier(); });
      });
      const chipB = host.querySelector('[data-act="chip"]');
      if (chipB) chipB.addEventListener("click", function () {
        const s = MS.store.get();
        if (!s.analyzed[key()]) MS.flow.openTier();   // 미분석 → 단계 시트(프로토 chipTap)
      });
      const dr = host.querySelector('[data-act="draws"]');
      if (dr) dr.addEventListener("click", openDraws);
      const stk = host.querySelector('[data-act="stocks"]');
      if (stk) stk.addEventListener("click", function () { MS.flow.openStocks(); });
      bindZoom();
      // FAB 스크롤 숨김(프로토 chScroll — 아래로 숨고 위로 복귀)
      let lastY = 0;
      host.addEventListener("scroll", function () {
        const fab2 = document.getElementById("msFab");
        if (!fab2) return;
        const y = host.scrollTop;
        fab2.style.transform = (y > lastY && y > 140) ? "translateY(140px)" : "";
        lastY = y;
      }, { passive: true });
    }

    load();
  }

  MS.router.register("chart", {
    mount: mount,
    unmount: function () { if (mount._removeFab) mount._removeFab(); }
  });
})();
