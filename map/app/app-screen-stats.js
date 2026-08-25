/* 머니스쿱 앱 — 통계 화면(함께 보는 머니스쿱 · 익명 통계).
   원본: 프로토 peers L809~993. 데이터 규율(P7): 서버 op peers 가 원장(app_ledger)에서
   파생한 실값만 표시하고, 표본이 없거나 서버가 못 모으는 항목(페르소나 분포·가중치 집계·
   닉네임 리더보드)은 '집계 준비 중'으로 정직하게 적는다 — 무엇이 올지 이름으로, 수치는
   지어내지 않는다. 프로토의 62.6%/60.96%/8,214건은 전부 샘플이라 이식하지 않고,
   엔진 카드는 walk-forward 백테스트 정본(config POLICY.stats.backtest — forge-engine.html)과
   validatedAxes·version 라이브 파생으로 채운다(열린 엔진 — 축·버전이 늘면 여기도 는다). */
(function () {
  "use strict";
  const MS = (window.MS = window.MS || {});

  let stats = null;      // 서버 집계(성공 시 {ok,trend,tops,scored,styleFit,me,...})
  let statsErr = false;
  let engI = 0;          // 엔진 카드 페이지
  let touchX = null;
  let hostEl = null;

  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;"); }
  function fmtN(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ","); }

  // ── 공용 조각 ──
  function card(inner, delay) {
    return '<div style="margin:12px 16px 0;border-radius:14px;background:var(--sf1);padding:12px 16px' +
      (delay ? ';animation:msRevealUp 0.55s cubic-bezier(0.2,0.8,0.25,1) ' + delay + ' both' : "") + '">' + inner + "</div>";
  }
  function head(title, sub, right) {
    return '<div style="display:flex;align-items:baseline;gap:8px">' +
      '<span style="font-size:13.5px;font-weight:600;white-space:nowrap;flex:none">' + title + "</span>" +
      (sub ? '<span style="font-size:11.5px;color:var(--m1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + sub + "</span>" : "") +
      (right ? '<span style="margin-left:auto;font-size:11.5px;color:var(--m2);white-space:nowrap;flex:none">' + right + "</span>" : "") +
      "</div>";
  }
  // 집계 준비 중 — 무엇이 올지 이름으로 적는다(정직 표기)
  function pendingBody(what, why) {
    return '<div style="margin-top:12px;border:1px dashed var(--ln1);border-radius:10px;padding:12px;font-size:12px;color:var(--m1);line-height:1.65">' +
      '<span style="color:var(--t2);font-weight:600">집계 준비 중</span> — ' + what + "<br>" +
      '<span style="color:var(--m2)">' + why + "</span></div>";
  }

  // ── 엔진 스와이프 카드(4페이지) ──
  function engMeta() {
    const bt = MS.config.POLICY.stats.backtest;
    let badge0 = "집계 중";
    if (stats && stats.regTotal14 > 0) {
      let a = 0, b = 0;
      stats.trend.forEach(function (r, i) { if (i < 7) a += r.n; else b += r.n; });
      badge0 = a > 0 ? ((b >= a ? "+" : "−") + Math.abs(Math.round((b - a) / a * 100)) + "%") : "+";
    }
    return {
      titles: ["분석 엔진 사용량", "엔진 백테스트 성적", "검증 통과 예측 축", "살아있는 엔진"],
      subs: ["최근 2주 · 하루 등록 건수", "walk-forward · 방향 기준", "관문 통과한 축만 공개", "스쿱 엔진 현황"],
      badges: [badge0, bt.hit + "%", MS.engine.core().validatedAxes.length + "축", "● LIVE"]
    };
  }

  function engPage0() {
    if (!stats || !stats.regTotal14) {
      return '<div style="display:flex;align-items:center;height:76px;font-size:12px;color:var(--m1);line-height:1.65">' +
        "아직 등록된 예측이 충분히 쌓이지 않았어요.<br>심화·커스텀 분석이 등록되는 대로 하루 단위로 집계돼요.</div>";
    }
    let mx = 1;
    stats.trend.forEach(function (r) { if (r.n > mx) mx = r.n; });
    let bars = "";
    stats.trend.forEach(function (r, i) {
      const last = i === stats.trend.length - 1;
      const h = Math.max(3, Math.round(r.n / mx * 46));
      const dl = String(r.day || "").replace(/^\d{4}-/, "").replace("-", "/");   // 08-25 → 08/25
      bars += '<span data-barv="' + esc((last ? "오늘" : dl) + " · " + r.n + "건") + '" style="flex:1;cursor:pointer;min-width:6px;height:' + h + "px;border-radius:3px 3px 0 0;background:" +
        (last ? "linear-gradient(180deg,#9d93ff,#7b6cff)" : "rgba(123,108,255," + (0.18 + i / stats.trend.length * 0.4).toFixed(2) + ")") +
        (last ? ";animation:msPredPulse 1.6s ease-in-out infinite" : "") + '"></span>';
    });
    return '<div style="display:flex;align-items:flex-end;gap:4px;height:54px">' + bars + "</div>" +
      '<div style="margin-top:4px;text-align:right;font-size:11.5px;color:var(--m1)">← 2주 전 · 오늘 →</div>';
  }

  function engPage1() {
    const bt = MS.config.POLICY.stats.backtest;
    const C = 194.8;
    const dash = (bt.hit / 100 * C).toFixed(1);
    const baseAng = bt.base / 100 * 360 - 90;
    const bx = (38 + Math.cos(baseAng * Math.PI / 180) * 31).toFixed(1);
    const by = (38 + Math.sin(baseAng * Math.PI / 180) * 31).toFixed(1);
    let userLine = "표본이 쌓이면 실제 사용자 집계도 함께 병기해요.";
    if (stats && stats.scored.n >= 30) {
      userLine = "사용자 예측 <b style=\"color:var(--t1)\">" + fmtN(stats.scored.n) + "건</b> 적중 " +
        Math.round(stats.scored.hit / stats.scored.n * 100) + "% · 같은 기간 실제 상승 " +
        Math.round(stats.scored.up / stats.scored.n * 100) + "%.";
    }
    return '<div style="display:flex;align-items:center;gap:14px">' +
      '<div style="position:relative;width:76px;height:76px;flex:none">' +
      '<svg viewBox="0 0 76 76" width="76" height="76" style="display:block">' +
      '<circle cx="38" cy="38" r="31" fill="none" stroke="var(--sf3)" stroke-width="7"></circle>' +
      '<circle cx="38" cy="38" r="31" fill="none" stroke="var(--up)" stroke-width="7" stroke-linecap="round" stroke-dasharray="' + dash + ' ' + C + '" transform="rotate(-90 38 38)"></circle>' +
      '<circle cx="' + bx + '" cy="' + by + '" r="2.4" fill="var(--ac)"></circle>' +
      "</svg>" +
      '<span style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-family:\'IBM Plex Mono\',monospace;font-size:15px;font-weight:700;color:var(--up)">' + bt.hit + "%</span></div>" +
      '<div style="flex:1;min-width:0;font-size:11.5px;color:var(--t2);line-height:1.7">walk-forward 백테스트 <b style="color:var(--t1)">' + bt.n + "건 · " + bt.syms + '종목</b>의 방향 적중률.<br>' +
      '<span style="color:var(--ac)">기준선(항상 상승) ' + bt.base + '%</span>를 넘지 못해요 — 방향은 참고용.<br>' +
      '<span style="color:var(--m1)">보정 없이 그대로 공개 — 판단은 각자의 몫. ' + userLine + "</span></div></div>";
  }

  function engPage2() {
    const axes = MS.engine.core().validatedAxes;
    let bars = "";
    axes.forEach(function (a) {
      const h = Math.round((a.acc - 40) / 40 * 50);
      bars += '<span style="flex:1;display:flex;flex-direction:column;justify-content:flex-end;height:100%;min-width:0">' +
        '<span style="height:' + h + 'px;background:' + (a.acc >= 65 ? "var(--cu)" : "rgba(123,108,255,0.55)") + ';border-radius:2.5px 2.5px 0 0"></span>' +
        '<span style="margin-top:3px;font-size:8.5px;color:var(--m2);text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(a.lab.slice(0, 4)) + "</span></span>";
    });
    return '<div style="display:flex;align-items:flex-end;gap:4px;height:66px">' + bars + "</div>" +
      '<div style="margin-top:6px;font-size:11.5px;color:var(--t2);line-height:1.65">walk-forward 관문을 통과한 예측 축 <b style="color:var(--cu)">' + axes.length + "종</b> — 축마다 실측 정확도를 백서에 공개해요</div>";
  }

  function engPage3() {
    const scoredN = stats ? fmtN(stats.scored.n) : "—";
    const stat = function (k, v, s2, c) {
      return '<div style="flex:1;border-radius:10px;background:var(--sf2);padding:10px 12px;min-width:0">' +
        '<div style="font-size:10.5px;color:var(--m1)">' + k + "</div>" +
        '<div style="margin-top:4px;font-family:\'IBM Plex Mono\',monospace;font-size:16px;font-weight:700;color:' + c + ';white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + v + "</div>" +
        '<div style="margin-top:3px;font-size:10px;color:var(--m2)">' + s2 + "</div></div>";
    };
    return '<div style="display:flex;gap:8px">' +
      stat("가동", "24/7", "시장 감시", "var(--up)") +
      stat("누적 채점", scoredN, "전량 보존", "var(--ac)") +
      stat("엔진 버전", esc(MS.engine.core().version), "계속 진화", "var(--cu)") +
      "</div>" +
      '<div style="margin-top:8px;font-size:11px;color:var(--m1)">스스로 채점하고 고치는 고리 — 스쿱 엔진은 멈춰 있지 않아요</div>';
  }

  function engCard() {
    const m = engMeta();
    const pages = [engPage0, engPage1, engPage2, engPage3];
    let dots = "";
    for (let i = 0; i < 4; i++) {
      dots += '<span data-engdot="' + i + '" style="width:' + (engI === i ? "18px" : "6px") + ';height:6px;border-radius:3px;background:' +
        (engI === i ? "var(--ac)" : "var(--m3)") + ';cursor:pointer;transition:all 0.25s"></span>';
    }
    return '<div id="msEngCard" style="margin:16px 16px 0;border-radius:14px;background:var(--sf1);padding:12px 0 10px;animation:msRevealUp 0.55s cubic-bezier(0.2,0.8,0.25,1) 0.08s both;overflow:hidden">' +
      '<div style="display:flex;align-items:baseline;gap:8px;padding:0 16px">' +
      '<span style="font-size:13.5px;font-weight:600;white-space:nowrap;flex:none">' + m.titles[engI] + "</span>" +
      '<span style="font-size:12.5px;color:var(--m1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + m.subs[engI] + "</span>" +
      '<span style="margin-left:auto;font-family:\'IBM Plex Mono\',monospace;font-size:13px;color:var(--up);white-space:nowrap;flex:none">' + m.badges[engI] + "</span></div>" +
      '<div style="margin-top:10px;padding:0 16px;min-height:96px">' + pages[engI]() + "</div>" +
      '<div style="margin-top:10px;display:flex;align-items:center;justify-content:center;gap:6px">' + dots + "</div></div>";
  }

  // ── 최다 분석 종목 ──
  function topsCard() {
    const inner = head("최근 1주일 가장 많이 분석된 종목", "", "분석 점유율");
    if (!stats || !stats.topsTotal) {
      return card(inner + pendingBody("종목별 분석 점유율 · HOT · 내 관심 배지",
        "최근 7일 심화·커스텀 등록이 쌓이는 대로 집계돼요."), "");
    }
    const picks = MS.store.get().picks || [];
    const mx = stats.tops[0].n;
    let rows = "";
    stats.tops.forEach(function (r, i) {
      const share = Math.round(r.n / stats.topsTotal * 100);
      rows += '<div style="display:flex;align-items:center;gap:8px">' +
        '<span style="font-family:\'IBM Plex Mono\',monospace;font-size:12.5px;color:var(--m1);width:14px;flex:none">' + (i + 1) + "</span>" +
        '<div style="width:118px;flex:none;display:flex;align-items:center;gap:4px;min-width:0">' +
        '<span style="font-size:13px;font-weight:700;overflow:hidden;text-overflow:ellipsis">' + esc(r.sym) + "</span>" +
        (i < 2 && r.n >= MS.config.POLICY.stats.minN ? '<span style="font-size:10.5px;color:var(--am);border:1px solid rgba(255,176,32,0.45);border-radius:3px;padding:0 4px;white-space:nowrap;flex:none">HOT</span>' : "") +
        (picks.indexOf(r.sym) >= 0 ? '<span style="font-size:10.5px;color:var(--ac);border:1px solid rgba(123,108,255,0.45);border-radius:3px;padding:0 4px;white-space:nowrap;flex:none">내 관심</span>' : "") +
        "</div>" +
        '<div style="flex:1;height:7px;border-radius:4px;background:var(--sf3);overflow:hidden"><div style="height:100%;width:' + Math.round(r.n / mx * 100) + '%;border-radius:4px;background:linear-gradient(90deg,#7b6cff,#9d93ff)"></div></div>' +
        '<span style="font-family:\'IBM Plex Mono\',monospace;font-size:12.5px;color:var(--t2);width:34px;text-align:right;flex:none">' + share + "%</span></div>";
    });
    return card(inner + '<div style="margin-top:12px;display:flex;flex-direction:column;gap:8px">' + rows + "</div>");
  }

  // ── 성향 분포(P8 전 준비 중) ──
  function piesCard() {
    const pd = stats && stats.personaDist;
    if (!pd || !pd.n) {
      return card(head("다들 어떤 성향일까", "페르소나 답변 기준") +
        pendingBody("가장 중요하게 보는 관점 — 성향 분포",
          "페르소나에 충분히 답한 구글 연결 사용자 " + (stats ? stats.minN : 5) + "명 이상 모이면 익명 분포로 열려요."));
    }
    const GN = { t: "추세형", m: "모멘텀형", v: "변동성형", q: "거래량형", s: "구조형" };
    const GC = { t: "#22d3ee", m: "#7b6cff", v: "#f0a020", q: "#2ed9a0", s: "#e06a6a" };
    const items = Object.keys(GN).map(function (k) { return { k: k, n: pd.counts[k] || 0 }; })
      .sort(function (a, b) { return b.n - a.n; });
    const mx = items[0].n || 1;
    let rows = "";
    items.forEach(function (it) {
      const pct = Math.round(it.n / pd.n * 100);
      rows += '<div style="display:flex;align-items:center;gap:8px">' +
        '<span style="width:70px;flex:none;font-size:13px;font-weight:600">' + GN[it.k] + "</span>" +
        '<div style="flex:1;height:8px;border-radius:4px;background:var(--sf3);overflow:hidden"><div style="height:100%;width:' + Math.max(3, Math.round(it.n / mx * 100)) + '%;border-radius:4px;background:' + GC[it.k] + '"></div></div>' +
        '<span class="mono" style="font-size:13px;font-weight:700;color:var(--t1);width:38px;text-align:right;flex:none">' + pct + "%</span></div>";
    });
    return card(head("다들 어떤 성향일까", "페르소나 답변 기준 · " + fmtN(pd.n) + "명") +
      '<div style="margin-top:12px;display:flex;flex-direction:column;gap:8px">' + rows + "</div>" +
      '<div style="margin-top:10px;font-size:11.5px;color:var(--m1);line-height:1.6">가장 많은 성향은 <b style="color:var(--t2)">' + GN[items[0].k] + "</b> — 나와 다른 성향이 시장을 어떻게 보는지 참고해요.</div>");
  }

  // ── 가중치 인기(서버 익명 집계) — 기본 ×1 기준 다이버징 바 톱5 ──
  function wtsCard() {
    const wp = stats && stats.weightPop;
    if (!wp || !wp.n) {
      return card(head("가장 많이 수정된 가중치", "커스텀 사용자") +
        pendingBody("기본 ×1 기준 — 다들 무엇을 키우고 줄이는지",
          "커스텀으로 가중치를 조절한 구글 연결 사용자 " + (stats ? stats.minN : 5) + "명 이상 모이면 열려요."));
    }
    const WN = { ma: "이동평균", supertrend: "슈퍼트렌드", macd: "MACD", bollinger: "볼린저밴드", volume: "거래량", rsi: "RSI 다이버전스", cmf: "거래량 다이버전스" };
    const items = (wp.items || []).slice().sort(function (a, b) { return Math.abs(b.avg - 1) - Math.abs(a.avg - 1); }).slice(0, 5);
    const span = 2;   // ×1 기준 좌우 최대 편차(0↔3 → −1↔+2, 시각 스케일 2)
    let rows = "";
    items.forEach(function (it) {
      const dev = it.avg - 1;                          // >0 키움 · <0 줄임
      const w = Math.min(50, Math.abs(dev) / span * 50);
      const up = dev >= 0;
      rows += '<div style="display:flex;align-items:center;gap:8px">' +
        '<span style="width:96px;flex:none;font-size:12.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + WN[it.id] + "</span>" +
        '<div style="flex:1;height:10px;position:relative;background:var(--sf3);border-radius:5px">' +
        '<div style="position:absolute;left:50%;top:0;bottom:0;width:1px;background:var(--ln2)"></div>' +
        '<div style="position:absolute;top:0;bottom:0;' + (up ? "left:50%" : "right:50%") + ';width:' + w + '%;border-radius:5px;background:' + (up ? "#2ed9a0" : "#e06a6a") + '"></div></div>' +
        '<span class="mono" style="font-size:12.5px;font-weight:700;color:' + (Math.abs(dev) < 0.05 ? "var(--m1)" : up ? "var(--up)" : "var(--dn)") + ';width:42px;text-align:right;flex:none">×' + it.avg.toFixed(2) + "</span></div>";
    });
    return card(head("가장 많이 수정된 가중치", "커스텀 사용자 " + fmtN(wp.n) + "명 · ×1 기준") +
      '<div style="margin-top:12px;display:flex;flex-direction:column;gap:8px">' + rows + "</div>" +
      '<div style="margin-top:10px;font-size:11.5px;color:var(--m1);line-height:1.6"><span style="color:var(--up)">오른쪽=더 크게</span> · <span style="color:var(--dn)">왼쪽=더 작게</span> 본다는 뜻 — 커스텀 사용자들의 평균 배율.</div>');
  }

  // ── 잘 맞는 관점(서버 실값) ──
  function styleCard() {
    const minN = stats ? stats.minN : MS.config.POLICY.stats.minN;
    if (!stats || !stats.styleFit.length) {
      return card(head("실제 잘 맞는 관점", "최근 90일 · 관점별 적중률") +
        pendingBody("관점(프리셋)별 방향 적중률 + 시장 기준선 병기",
          "채점 완료가 관점당 " + minN + "건 이상 쌓이면 실측으로 열려요 — 그 전엔 보여드리지 않아요."));
    }
    const base = stats.scored.n ? Math.round(stats.scored.up / stats.scored.n * 100) : null;
    let best = stats.styleFit[0], rows = "";
    stats.styleFit.forEach(function (r) { if (r.hit / r.n > best.hit / best.n) best = r; });
    stats.styleFit.forEach(function (r) {
      const pct = Math.round(r.hit / r.n * 100);
      const isBest = r === best;
      rows += '<div style="display:flex;align-items:center;gap:8px;margin-top:8px">' +
        '<span style="width:84px;flex:none;font-size:12.5px;font-weight:' + (isBest ? 700 : 500) + ";color:" + (isBest ? "var(--t1)" : "var(--t2)") + ';overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(r.preset) + "</span>" +
        '<div style="flex:1;position:relative;height:9px;border-radius:5px;background:var(--sf3)">' +
        '<span style="position:absolute;left:0;top:0;bottom:0;width:' + pct + "%;background:" + (isBest ? "var(--up)" : "rgba(123,108,255,0.6)") + ';border-radius:5px"></span>' +
        (base != null ? '<span style="position:absolute;left:' + base + '%;top:-2px;bottom:-2px;width:1px;background:rgba(123,108,255,0.6)"></span>' : "") +
        "</div>" +
        '<span style="width:35px;text-align:right;font-family:\'IBM Plex Mono\',monospace;font-size:12.5px;color:' + (isBest ? "var(--up)" : "var(--t2)") + '">' + pct + "%</span>" +
        '<span style="width:33px;text-align:right;font-size:11.5px;color:var(--m2)">' + r.n + "건</span></div>";
    });
    return card(head("실제 잘 맞는 관점", "최근 90일 · 관점별 적중률", base != null ? "┆ 기준선(실제 상승) " + base + "%" : "") + rows +
      '<div style="margin-top:12px;border-top:1px dashed var(--ln1);padding-top:8px;font-size:12.5px;color:var(--t2);line-height:1.55">' +
      "요즘은 <b style=\"color:var(--ac)\">" + esc(best.preset) + "</b> 관점이 가장 잘 맞고 있어요. 다음 심화 분석에서 이 관점을 골라 보세요</div>");
  }

  // ── 리더보드(닉네임=P8) + 나의 적중률(실값) ──
  function boardCard() {
    const minN = stats ? stats.minN : MS.config.POLICY.stats.minN;
    let mine = "";
    if (stats && stats.me.n > 0) {
      const pct = Math.round(stats.me.hit / stats.me.n * 100);
      mine = '<div style="margin-top:12px;border-top:1px dashed var(--ln1);padding-top:12px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">' +
        '<span style="font-size:12.5px;color:var(--t2)">나의 적중률</span>' +
        '<span style="font-family:\'IBM Plex Mono\',monospace;font-size:13.5px;font-weight:700;color:var(--ac)">' + pct + "%</span>" +
        '<span style="font-size:12.5px;color:var(--m1)">— ' +
        (stats.me.rank != null ? "상위 " + stats.me.rank + "%" : "채점 " + stats.me.n + "건 · " + minN + "건부터 순위가 나와요") + "</span>" +
        '<span style="margin-left:auto;font-size:11.5px;color:var(--m1)">채점 탭에서 자세히</span></div>';
    }
    const leads = (stats && stats.leads) || [], vols = (stats && stats.vols) || [];
    const rk = function (i) { return String(i + 1).padStart(2, "0"); };
    let leadRows = "", volRows = "";
    leads.forEach(function (r, i) {
      const pct = Math.round(r.hit / r.n * 100);
      leadRows += '<div style="display:flex;align-items:center;gap:8px">' +
        '<span class="mono" style="font-size:12.5px;color:var(--ac);flex:none">' + rk(i) + "</span>" +
        '<div style="width:104px;flex:none;overflow:hidden"><div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(r.nick) + "</div></div>" +
        '<div style="flex:1;height:7px;border-radius:4px;background:var(--sf3);overflow:hidden"><div style="height:100%;width:' + Math.max(4, Math.min(100, Math.round((pct - 50) / 30 * 100))) + '%;border-radius:4px;background:linear-gradient(90deg,#2ed9a0,#22d3ee)"></div></div>' +
        '<span class="mono" style="font-size:13px;font-weight:700;color:var(--up);width:38px;text-align:right;flex:none">' + pct + "%</span>" +
        '<span class="mono" style="font-size:11.5px;color:var(--m1);width:44px;text-align:right;flex:none">' + fmtN(r.n) + "회</span></div>";
    });
    const vmx = vols.length ? vols[0].n : 1;
    vols.forEach(function (r, i) {
      volRows += '<div style="display:flex;align-items:center;gap:8px">' +
        '<span class="mono" style="font-size:12.5px;color:var(--cu);flex:none">' + rk(i) + "</span>" +
        '<div style="width:104px;flex:none;overflow:hidden"><div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(r.nick) + "</div></div>" +
        '<div style="flex:1;height:7px;border-radius:4px;background:var(--sf3);overflow:hidden"><div style="height:100%;width:' + Math.round(r.n / vmx * 100) + '%;border-radius:4px;background:linear-gradient(90deg,#7b6cff,#d2a516)"></div></div>' +
        '<span class="mono" style="font-size:13px;font-weight:700;color:var(--cu);width:52px;text-align:right;flex:none">' + fmtN(r.n) + "회</span></div>";
    });
    // 레벨 보드(활동 XP — 원장 파생: 통산 등록·적중. 참여 XP 와 별개) — §15 서버 검증 충족으로 해금
    const levels = (stats && stats.levels) || [], myLevel = stats && stats.myLevel;
    const lmx = levels.length ? levels[0].xp : 1;
    let lvRows = "";
    levels.forEach(function (r, i) {
      lvRows += '<div style="display:flex;align-items:center;gap:8px">' +
        '<span class="mono" style="font-size:12.5px;color:#22d3ee;flex:none">' + rk(i) + "</span>" +
        '<div style="width:104px;flex:none;overflow:hidden"><div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(r.nick) + "</div></div>" +
        '<div style="flex:1;height:7px;border-radius:4px;background:var(--sf3);overflow:hidden"><div style="height:100%;width:' + Math.max(6, Math.round(r.xp / lmx * 100)) + '%;border-radius:4px;background:linear-gradient(90deg,#22d3ee,#7b6cff)"></div></div>' +
        '<span class="mono" style="font-size:12.5px;font-weight:700;color:var(--t1);width:34px;text-align:right;flex:none">Lv' + r.level + "</span>" +
        '<span class="mono" style="font-size:11.5px;color:var(--m1);width:46px;text-align:right;flex:none">' + fmtN(r.xp) + "점</span></div>";
    });
    const minReg = myLevel ? myLevel.minReg : 10;
    const levelBlock = levels.length
      ? '<div style="margin-top:12px;display:flex;flex-direction:column;gap:8px">' + lvRows + "</div>"
      : pendingBody("레벨 리더보드(닉네임)", "구글 연결 사용자 중 등록 분석 " + minReg + "건 이상이 생기면 열려요.");
    const myLvLine = (myLevel && myLevel.reg > 0)
      ? '<div style="margin-top:10px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">' +
        '<span style="font-size:12.5px;color:var(--t2)">나의 활동 레벨</span>' +
        '<span class="mono" style="font-size:13.5px;font-weight:700;color:#22d3ee">Lv' + myLevel.level + "</span>" +
        '<span class="mono" style="font-size:12.5px;color:var(--m1)">' + fmtN(myLevel.xp) + "점</span>" +
        '<span style="font-size:12.5px;color:var(--m1)">— ' + (myLevel.rank != null ? "상위 " + myLevel.rank + "위" : "등록 " + minReg + "건부터 순위가 나와요") + "</span></div>"
      : "";

    const leadBlock = leads.length
      ? '<div style="margin-top:12px;display:flex;flex-direction:column;gap:8px">' + leadRows + "</div>"
      : pendingBody("적중 리더보드(닉네임)", "구글 연결 사용자 중 최근 90일 채점 30회 이상이 생기면 열려요.");
    const volBlock = vols.length
      ? '<div style="margin-top:12px;display:flex;flex-direction:column;gap:8px">' + volRows + "</div>"
      : pendingBody("다작 리더보드(닉네임)", "구글 연결 사용자의 최근 30일 등록 건수로 열려요.");
    return card(head("예측이 잘 맞은 사용자", "최근 90일 · 30회 이상 · 닉네임") + leadBlock +
      '<div style="margin-top:12px;border-top:1px dashed var(--ln1);padding-top:12px">' +
      head("분석을 많이 한 사용자", "최근 30일 · 닉네임") + volBlock + "</div>" +
      '<div style="margin-top:12px;border-top:1px dashed var(--ln1);padding-top:12px">' +
      head("레벨이 높은 사용자", "통산 분석·적중 · 닉네임") + levelBlock + myLvLine +
      '<div style="margin-top:8px;font-size:11px;color:var(--m2);line-height:1.6">활동 레벨은 실제 분석 등록·적중 기록으로만 매겨요(방문·둘러보기 경험치와 별개).</div>' + "</div>" + mine +
      '<div style="margin-top:8px;font-size:11.5px;color:var(--m1);line-height:1.6">뼈대 엔진은 모두 같아요. 관점과 가중치, <b style="color:var(--t2)">투자 페르소나</b>에 따라 예측이 달라지니, 적중률도 사람마다 다릅니다.</div>');
  }

  function render() {
    if (!hostEl) return;
    const offline = statsErr ? '<div style="margin:12px 16px 0;border-radius:12px;border:1px solid rgba(255,176,32,0.3);background:rgba(255,176,32,0.05);padding:10px 12px;font-size:12px;color:var(--t2)">집계 서버에 연결하지 못했어요 — 엔진 정본 수치만 표시 중이에요. <span data-retry style="color:var(--ac);cursor:pointer;font-weight:600">다시 시도</span></div>' : "";
    const keep = hostEl.scrollTop;   // 도트 전환 재렌더 시 스크롤 위치 유지(.ms-screen 이 스크롤러)
    hostEl.innerHTML =
      '<div style="overflow-x:hidden;padding-bottom:24px">' +
      '<div style="padding:16px 16px 0;display:flex;align-items:baseline;gap:8px;animation:msRevealUp 0.55s cubic-bezier(0.2,0.8,0.25,1) 0s both">' +
      '<span style="font-size:19px;font-weight:700;letter-spacing:-0.02em;white-space:nowrap;flex:none">함께 보는 머니스쿱</span>' +
      '<span style="font-size:12.5px;color:var(--m1);white-space:nowrap;flex:none">익명 통계</span></div>' +
      offline + engCard() + topsCard() + piesCard() + wtsCard() + styleCard() + boardCard() +
      '<div style="margin:12px 16px 0;font-size:11.5px;color:var(--m2);line-height:1.6">익명 집계 · 수익률이 아닌 방향 적중 기준. 많이 본다고 오르지 않아요 — 판단은 각자의 몫.</div>' +
      '<div data-about style="margin:14px 16px 4px;padding-top:10px;border-top:1px solid var(--ln0);text-align:center;cursor:pointer">' +
      '<div style="font-size:10.5px;color:var(--m2);line-height:1.6">머니스쿱은 투자 참고 정보를 제공하며, 투자 권유·수익 보장이 아닙니다. 판단과 책임은 이용자 본인에게 있습니다.</div>' +
      '<div style="margin-top:2px;font-size:10.5px;color:var(--m2)">SCOOP ENGINE <span style="font-family:\'IBM Plex Mono\',monospace">v' + esc(MS.engine.core().version) + "</span> · 소개·면책·문의 보기</div></div></div>";
    hostEl.scrollTop = keep;
  }

  function load() {
    statsErr = false;
    MS.data.api("peers", {}).then(function (r) {
      if (r && r.ok) { stats = r; } else { statsErr = true; }
      render();
    }).catch(function () { statsErr = true; render(); });
  }

  function mount(host) {
    hostEl = host;
    render();     // 즉시(엔진 정본·준비 중) → 서버 응답 오면 실값으로 재렌더
    load();
    host.addEventListener("click", function (e) {
      const dot = e.target.closest("[data-engdot]");
      if (dot) { engI = parseInt(dot.getAttribute("data-engdot"), 10); render(); return; }
      if (e.target.closest("[data-about]")) { MS.ui.openAbout(); return; }
      if (e.target.closest("[data-retry]")) { load(); return; }
    });
    // 엔진 카드 스와이프(프로토 engTS/engTE — 40px 임계)
    host.addEventListener("touchstart", function (e) {
      if (!e.target.closest("#msEngCard")) { touchX = null; return; }
      touchX = e.touches && e.touches[0] ? e.touches[0].clientX : null;
    }, { passive: true });
    host.addEventListener("touchend", function (e) {
      if (touchX == null) return;
      const t = e.changedTouches && e.changedTouches[0];
      if (!t) { touchX = null; return; }
      const dx = t.clientX - touchX;
      touchX = null;
      if (Math.abs(dx) < MS.config.POLICY.ui.swipePx) return;
      engI = Math.max(0, Math.min(3, engI + (dx < 0 ? 1 : -1)));
      render();
    }, { passive: true });
  }

  MS.router.register("stats", { mount: mount, refresh: load });
})();
