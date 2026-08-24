/* 머니스쿱 앱 — 분석(종목 상세) 화면 v1.
   원본: 프로토 chart L333~624. P1 범위: 서브헤더·TF 세그(분석 티어 도트)·상태 칩 3태 ·
   차트(분석 전=캔들만+예측 없음 배지 / basic=회색 콘+1차선+작도) · 판정 블록(실 verdict) ·
   basic 업셀+잠금 행 · 세그 4탭(근거·지표 실구현, 시점별·해설=basic 잠금) · 미채점 고지.
   FAB: P1 은 기본 분석 직행(단계 선택 시트는 P2 — 교체 지점 주석). 24h 만료 시 재분석 유도.
   리로드 후 기록은 있는데 리포트(메모리)가 없으면 basic 을 조용히 재계산해 복원(무료·결정적). */
(function () {
  "use strict";
  const MS = (window.MS = window.MS || {});
  const str = MS.str;
  const TIER_C = { basic: "#8b93a7", deep: "#7b6cff", custom: "var(--cu)" };

  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;"); }
  function fmtPrice(v) {
    if (v == null || !isFinite(v)) return "—";
    return v >= 1000 ? Math.round(v).toLocaleString("en-US") : (Math.round(v * 100) / 100).toFixed(2);
  }

  function mount(host) {
    let candles = null, quote = null, rebuilding = false;
    let seg = "evi";

    function key() { const s = MS.store.get(); return s.ticker + "|" + s.tf; }
    function liveReport() {
      const s = MS.store.get();
      const t = s.analyzed[key()];
      if (!t) return null;
      return MS.reports[key()] || null;
    }

    async function load() {
      const s = MS.store.get();
      if (!s.ticker) { MS.router.go("home"); return; }
      candles = null; render();
      try {
        const r = await MS.data.ohlc.fetch(s.ticker, s.tf);
        if (MS.store.get().screen !== "chart") return;
        if (!r.ok) { candles = "err"; render(); return; }
        candles = r.candles;
        quote = MS.data.quote(r.candles);
        // 기록은 있는데 리포트가 없다(리로드) → basic 재계산 복원(P2: 리포트 영속화로 대체)
        if (s.analyzed[key()] && !MS.reports[key()] && !rebuilding) {
          rebuilding = true;
          MS.engine.analyze({ symbol: s.ticker, tfKo: s.tf, tier: "basic", candles: r.candles })
            .then(function (rep) {
              rep.at = s.analyzedAt[key()] || Date.now();
              MS.reports[key()] = rep;
              rebuilding = false;
              if (MS.store.get().screen === "chart") render();
            }).catch(function () { rebuilding = false; });
        }
        render();
      } catch (e) { candles = "err"; render(); }
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

    function render() {
      const s = MS.store.get();
      const rep = liveReport();
      const tier = s.analyzed[key()] || null;
      const v = rep ? rep.verdict : null;
      const master = MS.data.MASTER.filter(function (t) { return t.sym === s.ticker; })[0];
      const chip = statusChip();

      let chartHtml;
      if (candles === "err") {
        chartHtml = '<div style="height:396px;display:flex;align-items:center;justify-content:center;font-size:13px;color:var(--dn)">시세를 불러오지 못했어요</div>';
      } else if (!candles) {
        chartHtml = '<div style="height:396px;display:flex;align-items:center;justify-content:center;font-size:13px;color:var(--m1)">실봉 불러오는 중…</div>';
      } else {
        const model = MS.chart.build(candles, rep ? rep.prediction : null, {});
        chartHtml = '<div style="position:relative">' +
          MS.chart.svg(model, rep ? { cone: true, coneBasic: tier === "basic", pred: true, ma: true, boll: true } : {}) +
          (!rep ? '<span style="position:absolute;left:50%;top:46%;transform:translate(-50%,-50%);font-size:12px;color:var(--m1);border:1px dashed var(--ln2);border-radius:99px;padding:6px 14px;background:rgba(var(--ovr),0.85);white-space:nowrap">분석 전 — 예측 없음</span>' : "") +
          "</div>";
      }

      const dirTxt = v ? (v.dir === "up" ? "▲ 상승" : v.dir === "down" ? "▼ 하락" : "— 중립") : "분석 전";
      const dirC = v ? (v.dir === "up" ? "var(--up)" : v.dir === "down" ? "var(--dn)" : "var(--t2)") : "var(--m1)";
      const oneLine = v ? ("지표 " + v.totalInd + "개 중 " + v.agree + "개가 같은 방향을 봅니다 · 상승 확률 " + v.prob + "%") : "";
      const plainLine = v ? ("현재가 기준 목표 " + fmtPrice(v.target) + " · " + fmtPrice(v.invalid) + " 아래로 내려가면 이 예측은 접습니다") : "";

      host.innerHTML =
        '<div style="padding-bottom:110px">' +
        // 서브헤더
        '<div style="display:flex;align-items:center;gap:8px;padding:12px 16px 0">' +
        '<button data-act="back" aria-label="홈으로" style="width:32px;height:32px;display:flex;align-items:center;justify-content:center;background:none;border:0;color:var(--m1);cursor:pointer;flex:none"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"></path></svg></button>' +
        '<span style="font-size:16px;font-weight:700">' + esc(s.ticker) + "</span>" +
        '<span style="font-size:12.5px;color:var(--m1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(master ? master.name : "") + "</span>" +
        '<span style="margin-left:auto;text-align:right">' +
        '<span class="mono" style="display:block;font-size:14px;font-weight:600">' + (quote ? fmtPrice(quote.price) : "—") + "</span>" +
        (quote ? '<span class="mono" style="display:block;font-size:11.5px;font-weight:700;color:' + (quote.up ? "var(--up)" : "var(--dn)") + '">' + (quote.up ? "▲" : "▼") + Math.abs(quote.chg).toFixed(2) + "%</span>" : "") +
        "</span></div>" +
        // TF 세그 + 상태 칩
        '<div style="display:flex;align-items:center;gap:8px;padding:12px 16px 0">' +
        '<div style="display:flex;gap:4px;background:var(--sf1);border-radius:9px;padding:3px">' +
        ["일", "주", "월"].map(function (tf) {
          const on = s.tf === tf;
          const t2 = s.analyzed[s.ticker + "|" + tf];
          return '<button data-tf="' + tf + '" style="position:relative;min-width:44px;padding:7px 10px;border-radius:7px;border:0;cursor:pointer;font-family:inherit;font-size:12.5px;font-weight:' + (on ? 700 : 500) + ";color:" + (on ? "var(--t1)" : "var(--m1)") + ";background:" + (on ? "var(--sf3)" : "transparent") + '">' + tf +
            (t2 ? '<span style="position:absolute;right:4px;top:4px;width:5px;height:5px;border-radius:50%;background:' + TIER_C[t2] + '"></span>' : "") + "</button>";
        }).join("") + "</div>" +
        '<span style="margin-left:auto;font-size:11.5px;color:' + chip.fg + ";border:1px " + chip.dash + " " + chip.bd + ';border-radius:99px;padding:5px 12px;white-space:nowrap">' + chip.txt + "</span></div>" +
        // 차트
        '<div style="margin-top:8px">' + chartHtml + "</div>" +
        // 판정 블록
        '<div style="padding:16px 16px 0;position:relative;overflow:hidden">' +
        (v ? '<span style="position:absolute;left:0;top:0;bottom:0;width:38%;background:linear-gradient(100deg,transparent,rgba(123,108,255,0.07),transparent);animation:msSweepX 1.4s ease-out 0.25s both;pointer-events:none"></span>' : "") +
        '<div style="display:flex;align-items:baseline;gap:12px">' +
        '<span style="font-size:25px;font-weight:700;color:' + dirC + ';letter-spacing:-0.02em;display:inline-block;' + (v ? "animation:msVerdictPop 0.6s cubic-bezier(0.2,0.8,0.3,1.2) 0.18s both" : "") + '">' + dirTxt + "</span>" +
        (v ? '<span class="mono" style="font-size:18px;font-weight:600">' + v.agree + "/" + v.totalInd + '<span style="font-size:13px;color:var(--t2)"> 합의</span></span>' : "") +
        '<span class="mono" style="margin-left:auto;font-size:15px">' + (quote ? fmtPrice(quote.price) : "") + "</span></div>" +
        (v ?
          '<div style="margin-top:12px;display:flex;align-items:center;gap:8px">' +
          '<span class="mono" style="font-size:13px;color:var(--dn)">▼' + (100 - v.prob) + "</span>" +
          '<div style="flex:1;position:relative;height:9px;border-radius:5px;background:var(--sf3)">' +
          '<div style="position:absolute;left:0;top:0;bottom:0;width:' + v.prob + '%;border-radius:5px;background:linear-gradient(90deg,var(--updeep),var(--up))"></div>' +
          '<div style="position:absolute;left:60.96%;top:-3px;bottom:-3px;width:2px;background:var(--ac)"></div></div>' +
          '<span class="mono" style="font-size:13px;color:var(--up)">▲' + v.prob + "</span></div>" +
          '<div style="margin-top:4px;text-align:right;font-size:11.5px;color:var(--ac)">세로 표시 = 시장 평균 60.96%</div>' +
          '<div style="margin-top:12px;font-size:13.5px;color:var(--t1)">' + oneLine + "</div>" +
          '<div style="margin-top:4px;font-size:13px;color:var(--t2);line-height:1.55">' + plainLine + "</div>" +
          '<div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:4px 16px;font-size:13px;color:var(--t2)">' +
          "<span>예상 범위 <b style=\"color:var(--t1)\">" + fmtPrice(v.rangeLo) + " ~ " + fmtPrice(v.rangeHi) + "</b></span>" +
          "<span>목표 <b style=\"color:var(--t1)\">" + fmtPrice(v.target) + "</b></span></div>" +
          (tier === "basic" ? '<div style="margin-top:12px;border-radius:10px;background:var(--sf2);padding:8px 12px;font-size:13px;color:var(--m1)">기본 분석은 채점하지 않아요. 기록은 심화·커스텀부터 남습니다</div>' : "")
        :
          '<div style="margin-top:12px;border:1px dashed var(--ln2);border-radius:9px;padding:12px">' +
          '<div style="font-size:13.5px;font-weight:600">아직 분석 전이에요</div>' +
          '<div style="margin-top:4px;font-size:13px;color:var(--m1);line-height:1.6">방향·범위·목표는 분석 후에 열려요 · 기본 분석은 무료</div></div>'
        ) + "</div>" +
        // basic 업셀 + 잠금 행
        (tier === "basic" ?
          '<div style="margin:16px 16px 0;border:1px solid rgba(123,108,255,0.3);border-radius:12px;background:rgba(123,108,255,0.1);padding:12px 16px">' +
          '<div style="display:flex;align-items:center;gap:8px"><span style="font-size:13.5px;font-weight:700">지금 결과는 기본 분석입니다</span><span style="font-size:12.5px;color:var(--t2);border:1px solid var(--ln2);border-radius:99px;padding:2px 8px">도구 5개</span></div>' +
          '<div style="margin-top:4px;font-size:13px;color:var(--t2);line-height:1.6">방향과 예상 범위까지 확인했어요. <b style="color:var(--t1)">32개 도구가 왜 그렇게 봤는지</b>는 심화에서 열립니다.</div>' +
          '<div data-act="tier" style="margin-top:12px;height:48px;border-radius:9px;background:linear-gradient(135deg,#7b6cff,#4a3ce0);display:flex;align-items:center;justify-content:center;gap:8px;cursor:pointer"><span style="font-size:13.5px;font-weight:700;color:#fff">심화로 더 깊이</span><span class="mono" style="font-size:13px;color:rgba(255,255,255,0.85)">◈ 2</span></div></div>' +
          '<div style="margin:16px 16px 0;border:1px solid var(--ln0);border-radius:14px;overflow:hidden">' +
          ["확신도(합의 상세)", "세 시점 예측", "반대 의견", "지표 해설 32개"].map(function (n) {
            return '<div data-act="tier" style="display:flex;align-items:center;gap:8px;padding:12px;border-bottom:1px solid var(--ln0);cursor:pointer">' +
              '<span style="font-size:13.5px;color:var(--t3)">' + n + "</span>" +
              '<span style="font-size:11.5px;color:var(--ac);border:1px solid rgba(123,108,255,0.3);border-radius:4px;padding:1px 8px">심화</span>' +
              '<span class="mono" style="margin-left:auto;font-size:13px;color:var(--m2)">—</span></div>';
          }).join("") +
          '<div data-act="tier" style="padding:12px;font-size:13px;color:var(--ac);background:var(--sf1);cursor:pointer">눌러서 열기 · 심화 ◈ 2</div></div>'
          : "") +
        // 세그 탭
        '<div style="display:flex;gap:4px;padding:16px 12px 8px;margin-top:8px">' +
        [["evi", "근거"], ["hz", "시점별"], ["ind", "지표"], ["narr", "해설"]].map(function (t) {
          const on = seg === t[0];
          return '<button data-seg="' + t[0] + '" style="flex:1;text-align:center;padding:8px 0;font-size:13px;font-weight:' + (on ? 700 : 500) + ";color:" + (on ? "var(--t1)" : "var(--m1)") + ";background:" + (on ? "var(--sf2)" : "transparent") + ";border:1px solid " + (on ? "var(--ln2)" : "transparent") + ';border-radius:7px;cursor:pointer;font-family:inherit">' + t[1] + "</button>";
        }).join("") + "</div>" +
        '<div style="padding:0 16px 12px;border-bottom:1px solid var(--sf3);font-size:12.5px;color:var(--m1)">' +
        (seg === "evi" ? "무엇을 보고 이렇게 판단했는지" : seg === "hz" ? "시점별로 어디까지 가는지" : seg === "ind" ? "지표들이 가리키는 방향" : "사람 말로 풀어낸 결론") + "</div>" +
        segBody(rep, tier) +
        // 푸터
        '<div style="margin:16px;font-size:11px;color:var(--m2);line-height:1.7">' +
        (candles && candles !== "err" ? "실봉 " + candles.length.toLocaleString("en-US") + "개 계산 · " : "") +
        "시세는 지연될 수 있어요 · 예측은 참고용이며 투자 판단과 책임은 본인에게 있습니다.</div>" +
        "</div>" +
        // FAB — P2: 단계 선택 시트(tier)로 교체
        '<button data-act="fab" class="ms-press" style="position:fixed;right:16px;bottom:96px;z-index:30;height:48px;border-radius:99px;border:0;padding:0 20px;background:linear-gradient(135deg,#7b6cff,#4a3ce0);color:#fff;font-size:13.5px;font-weight:700;font-family:inherit;box-shadow:0 10px 26px -10px rgba(123,108,255,0.8);cursor:pointer">' +
        (tier ? "다시 분석" : "분석하기") + "</button>";

      bind();
    }

    function segBody(rep, tier) {
      if (!rep) return '<div style="padding:20px 16px;font-size:13px;color:var(--m1)">분석하면 여기에 근거가 채워져요.</div>';
      if (seg === "evi") {
        const sorted = rep.indicators.slice().sort(function (a, b) { return b.strength - a.strength; });
        return '<div style="padding:12px 16px 0">' +
          '<div style="display:flex;align-items:baseline;gap:8px"><span style="font-size:13.5px;font-weight:600">지표 신호</span><span style="font-size:12.5px;color:var(--m1)">' + sorted.length + "개 · 강도순</span></div>" +
          sorted.map(function (g) {
            const arrow = g.bias > 0.05 ? "▲" : g.bias < -0.05 ? "▼" : "–";
            const c = g.bias > 0.05 ? "var(--up)" : g.bias < -0.05 ? "var(--dn)" : "var(--m1)";
            return '<div style="display:flex;gap:8px;padding:12px 0;border-bottom:1px solid var(--ln0);align-items:flex-start">' +
              '<span class="mono" style="color:' + c + ';font-size:13px;width:13px">' + arrow + "</span>" +
              '<div style="flex:1;min-width:0"><div style="font-size:13.5px;font-weight:600">' + esc(g.name) + "</div>" +
              '<div style="font-size:13px;color:var(--t2);line-height:1.5">' + esc(g.text) + "</div></div>" +
              '<div style="width:60px;flex:none;padding-top:4px"><div style="height:5px;border-radius:3px;background:var(--sf3)"><div style="width:' + g.strength + "%;height:5px;border-radius:3px;background:" + c + '"></div></div></div></div>';
          }).join("") + "</div>";
      }
      if (seg === "ind") {
        return '<div style="padding:12px 16px 0">' +
          rep.indicators.map(function (g) {
            const pct = Math.round(50 + Math.max(-1, Math.min(1, g.bias)) * 50);
            return '<div style="display:flex;align-items:center;gap:8px;padding:8px 0">' +
              '<span style="width:86px;flex:none;font-size:12.5px;color:var(--t2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(g.name) + "</span>" +
              '<div style="flex:1;position:relative;height:7px;border-radius:4px;background:var(--sf3)">' +
              '<span style="position:absolute;left:50%;top:-2px;bottom:-2px;width:1px;background:var(--ln2)"></span>' +
              (pct >= 50
                ? '<span style="position:absolute;left:50%;width:' + (pct - 50) + '%;top:0;bottom:0;background:var(--up);border-radius:0 4px 4px 0"></span>'
                : '<span style="position:absolute;right:50%;width:' + (50 - pct) + '%;top:0;bottom:0;background:var(--dn);border-radius:4px 0 0 4px"></span>') +
              "</div>" +
              '<span class="mono" style="width:34px;flex:none;text-align:right;font-size:11.5px;color:var(--m1)">' + (g.bias >= 0 ? "+" : "") + (Math.round(g.bias * 100) / 100) + "</span></div>";
          }).join("") + "</div>";
      }
      // hz·narr — basic 잠금(프로토 규칙)
      return '<div data-act="tier" style="margin:16px;border:1px dashed var(--ln2);border-radius:12px;padding:20px 16px;text-align:center;cursor:pointer">' +
        '<div style="font-size:13.5px;font-weight:600;color:var(--t3)">' + (seg === "hz" ? "세 시점 예측" : "지표 해설") + "은 심화부터</div>" +
        '<div style="margin-top:6px;font-size:12.5px;color:var(--m1)">심화 분석(◈ 2)에서 열립니다</div></div>';
    }

    function bind() {
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
          seg = b.getAttribute("data-seg");
          render();
          host.scrollTop = sc;   // 세그 전환 시 스크롤 위치 유지(지침서 §5)
        });
      });
      host.querySelectorAll('[data-act="tier"]').forEach(function (b) {
        b.addEventListener("click", function () { MS.ui.flash("심화·커스텀은 다음 단계에서 열려요", ""); });
      });
      const fab = host.querySelector('[data-act="fab"]');
      if (fab) fab.addEventListener("click", function () {
        const s = MS.store.get();
        if (s.runLive) { MS.ui.hap("warn"); MS.ui.flash(str("toast.runBusy"), ""); MS.router.go("run"); return; }
        // P2: sheet:'tier' 로 교체 — P1 은 무료 기본 분석 직행
        MS.runStart({ symbol: s.ticker, tfKo: s.tf, tier: "basic" });
      });
    }

    load();
  }

  MS.router.register("chart", { mount: mount });
})();
