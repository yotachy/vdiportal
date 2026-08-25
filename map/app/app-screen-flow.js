/* 머니스쿱 앱 — 분석 진입 플로우: 단계(tier)·스타일(preset)·차감(deduct)·부족(short) 시트 + mix·pfit 화면.
   마크업 원본: 프로토 L1720~1847(시트 4종)·L729~807(mix·pfit). 로직: dissection/03 §1-1~1-5.
   규칙: 차감은 최종 확인 1회(1050ms 자동 진행) · 부족 시 충전 안내 전환 · 잔액 음수 불가 ·
   24h 내 심화/커스텀 재분석 무차감(Q3 — 심화·커스텀 대칭) · guardRun(동시 1건) 전 진입점 선행.
   가중치·체크는 영속(Q8). 스쿱 차감은 P5 전까지 클라 POLICY 기준(흐름·타이밍은 시안 그대로). */
(function () {
  "use strict";
  const MS = (window.MS = window.MS || {});
  const str = MS.str;
  const P = function () { return MS.config.POLICY; };

  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;"); }
  const TIER_LABEL = { deep: "심화", custom: "커스텀" };
  const CAT = ["var(--bl)", "var(--pk)", "var(--cy)", "var(--am)", "var(--lv)"];   // 추세·모멘텀·거래량·변동성·구조
  const CN = ["추세", "모멘텀", "거래량", "변동성", "구조"];

  // 커스텀 mix 슬라이더 7지표(시안 wts) → 엔진 id (Q5: 다이버전스 2종은 rsi·volume 가중으로 흡수)
  const MIX_ROWS = [
    { id: "ma", n: "이동평균", sign: 1 },
    { id: "supertrend", n: "슈퍼트렌드", sign: 1 },
    { id: "macd", n: "MACD", sign: 1 },
    { id: "bollinger", n: "볼린저밴드", sign: 1 },
    { id: "volume", n: "거래량", sign: 1 },
    { id: "rsi", n: "RSI 다이버전스", sign: -1 },
    { id: "cmf", n: "거래량 다이버전스", sign: -1 }
  ];

  function guardRun() {
    if (!MS.store.get().runLive) return false;
    MS.ui.hap("warn");
    MS.ui.flash(str("toast.runBusy"), "");
    MS.router.go("run");
    return true;
  }
  MS.guardRun = guardRun;

  // 24h 내 심화/커스텀 결과가 살아 있으면 재분석 무차감(Q3 대칭)
  function liveFree() {
    const s = MS.store.get();
    const k = s.ticker + "|" + s.tf;
    const t = s.analyzed[k];
    const at = s.analyzedAt[k] || 0;
    return !!t && P().analysis.reanalysisFreeTiers.indexOf(t) >= 0 && (Date.now() - at) < P().analysis.ttlMs;
  }

  // ── 단계 선택 시트 ──
  function openTier() {
    if (guardRun()) return;
    const s = MS.store.get();
    const free = liveFree();
    const cd = P().scoop.costDeep, cc = P().scoop.costCustom;
    const nDeep = Math.floor(s.scoops / cd), nCust = Math.floor(s.scoops / cc);
    MS.ui.openSheet("tier", function (body, sheet) {
      body.innerHTML =
        '<div style="display:flex;align-items:center;gap:8px;padding:4px 0 12px;border-bottom:1px solid var(--sf3)">' +
        '<button data-act="close" aria-label="닫기" style="width:32px;height:32px;margin-left:-8px;display:flex;align-items:center;justify-content:center;color:var(--t2);cursor:pointer;flex:none;background:none;border:0"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"></path></svg></button>' +
        '<span style="font-size:16.5px;font-weight:600;white-space:nowrap;flex:none">얼마나 깊이 볼까요</span>' +
        '<span class="mono" style="margin-left:auto;font-size:13.5px;font-weight:600;color:var(--ac);background:rgba(123,108,255,0.1);border:1px solid rgba(123,108,255,0.3);border-radius:99px;padding:4px 12px;white-space:nowrap;flex:none">◈ ' + s.scoops + "</span></div>" +
        '<div style="margin:12px 0 0;border:1px dashed var(--ln2);border-radius:8px;padding:8px 12px;font-size:13px;color:var(--t2);text-align:center">' +
        (free ? "24시간 내 재분석 — 이번엔 차감 없어요" : "심화 " + nDeep + "번 · 커스텀 " + nCust + "번 · 기본 무제한") + "</div>" +
        '<div data-act="basic" style="margin-top:12px;border:1px solid rgba(139,147,167,0.45);border-radius:12px;background:var(--sf2);padding:12px 16px;cursor:pointer">' +
        '<div style="display:flex;align-items:center;gap:8px"><span style="font-size:13.5px;font-weight:800;color:#1a1e27;background:linear-gradient(135deg,#e8edf5,#b7c0d1);border-radius:6px;padding:4px 12px;white-space:nowrap;flex:none">기본</span><span style="font-size:13px;color:var(--up);white-space:nowrap;flex:none">0 · 무제한</span></div>' +
        '<div style="margin-top:4px;font-size:13.5px;color:var(--t1)"><b>가장 중요한 핵심 지표 5개</b> · 방향과 예상 범위</div></div>' +
        '<div data-act="deep" style="margin-top:8px;border:1px solid rgba(123,108,255,0.6);border-radius:12px;background:rgba(123,108,255,0.1);padding:12px 16px;cursor:pointer">' +
        '<div style="display:flex;align-items:center;gap:8px"><span style="font-size:13.5px;font-weight:800;color:#0a0c12;background:linear-gradient(135deg,#b3a9ff,#7b6cff);border-radius:6px;padding:4px 12px;white-space:nowrap;flex:none">심화</span><span class="mono" style="font-size:13px;color:var(--ac);white-space:nowrap;flex:none">' + (free ? "무차감" : "◈ " + cd) + "</span>" +
        (!free && s.scoops < cd ? '<span style="margin-left:auto;font-size:12.5px;color:var(--dn);white-space:nowrap">' + (cd - s.scoops) + " 부족</span>" : "") + "</div>" +
        '<div style="margin-top:4px;font-size:13.5px;color:var(--t1);line-height:1.55"><b style="color:var(--ac)">도구 ' + MS.engine.indicatorCount() + '개</b> · 관점 프리셋 · 2차 예측선</div></div>' +
        '<div data-act="custom" style="margin-top:8px;border:1px solid rgba(210,165,22,0.55);border-radius:12px;background:linear-gradient(140deg,rgba(210,165,22,0.1),rgba(210,165,22,0.03) 60%,var(--sf2));padding:12px 16px;cursor:pointer">' +
        '<div style="display:flex;align-items:center;gap:8px"><span style="font-size:13.5px;font-weight:800;color:#1a1204;background:linear-gradient(135deg,#ecca5e,#c1901a);border-radius:6px;padding:4px 12px;white-space:nowrap;flex:none">커스텀</span><span class="mono" style="font-size:13px;color:var(--cu);white-space:nowrap;flex:none">' + (free ? "무차감" : "◈ " + cc) + "</span>" +
        (!free && s.scoops < cc ? '<span style="margin-left:auto;font-size:12.5px;color:var(--dn);white-space:nowrap">' + (cc - s.scoops) + " 부족</span>" : "") + "</div>" +
        '<div style="margin-top:4px;font-size:13.5px;color:var(--t1);line-height:1.55"><b style="color:var(--cu)">도구 ' + MS.engine.indicatorCount() + '개＋가중치</b> · 페르소나 반영 · 3차 예측선</div></div>' +
        '<div style="margin:12px 0 4px;font-size:13px;color:var(--m1);text-align:center">차감은 마지막 확인에서 한 번뿐</div>';
      body.querySelector('[data-act="close"]').addEventListener("click", MS.ui.closeSheet);
      body.querySelector('[data-act="basic"]').addEventListener("click", function () {
        if (guardRun()) return;
        MS.ui.closeSheet();
        const st = MS.store.get();
        MS.runStart({ symbol: st.ticker, tfKo: st.tf, tier: "basic" });
      });
      body.querySelector('[data-act="deep"]').addEventListener("click", function () { pickPaid("deep"); });
      body.querySelector('[data-act="custom"]').addEventListener("click", function () { pickPaid("custom"); });
    });
  }

  function pickPaid(tier) {
    if (guardRun()) return;
    const s = MS.store.get();
    const cost = tier === "deep" ? P().scoop.costDeep : P().scoop.costCustom;
    if (!liveFree() && s.scoops < cost) { MS.ui.hap("warn"); openShort(tier); return; }
    MS.store.set({ tier: tier });
    openPreset(tier);
  }

  // ── 스타일(프리셋) 시트 ──
  function openPreset(tier) {
    const label = TIER_LABEL[tier];
    let more = false;
    MS.ui.openSheet("preset", function (body, sheet) {
      sheet.style.top = "26px";
      sheet.style.maxHeight = "none";
      function render() {
        const s = MS.store.get();
        const sel = s.preset || "전체 종합";
        const topNames = ["전체 종합", "추세 중심"];
        const moreOn = more || topNames.indexOf(sel) < 0;
        const free = liveFree();
        const cost = tier === "deep" ? P().scoop.costDeep : P().scoop.costCustom;
        const badgeBg = tier === "deep" ? "linear-gradient(135deg,#b3a9ff,#7b6cff)" : "linear-gradient(135deg,#ecca5e,#c1901a)";
        const badgeFg = tier === "deep" ? "#0a0c12" : "#1a1204";

        function topCard(name, tag, tagC, why, locked) {
          const on = !locked && sel === name;
          return '<div data-top="' + (locked ? "" : esc(name)) + '" style="border:1px ' + (locked ? "dashed var(--ln2)" : "solid " + (on ? "rgba(123,108,255,0.65)" : "var(--ln1)")) + ";border-radius:12px;background:" + (on ? "rgba(123,108,255,0.12)" : "var(--sf2)") + ';padding:11px 14px;cursor:pointer;display:flex;align-items:flex-start;gap:10px">' +
            '<span style="width:18px;height:18px;border-radius:50%;border:2px solid ' + (on ? "#7b6cff" : "var(--m3)") + ';display:flex;align-items:center;justify-content:center;flex:none;margin-top:1px"><span style="width:8px;height:8px;border-radius:50%;background:' + (on ? "#7b6cff" : "transparent") + '"></span></span>' +
            '<div style="min-width:0;flex:1"><div style="display:flex;align-items:center;gap:8px">' +
            '<span style="font-size:14px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0">' + (locked ? "내 성향 맞춤" : esc(name)) + "</span>" +
            '<span style="margin-left:auto;font-size:11px;font-weight:600;color:' + tagC + ';white-space:nowrap;flex:none">' + tag + "</span></div>" +
            '<div style="margin-top:3px;font-size:12.5px;color:var(--t2);line-height:1.55">' + why + "</div></div></div>";
        }

        body.innerHTML =
          '<div style="display:flex;align-items:center;gap:4px;padding-top:4px">' +
          '<button data-act="back" aria-label="뒤로" style="width:32px;height:32px;margin-left:-8px;display:flex;align-items:center;justify-content:center;color:var(--t2);cursor:pointer;flex:none;background:none;border:0"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M11 18l-6-6 6-6"></path></svg></button>' +
          '<div style="font-size:18px;font-weight:700;letter-spacing:-0.03em;white-space:nowrap">어떤 스타일로 볼까요?</div>' +
          '<span style="font-size:12.5px;font-weight:800;color:' + badgeFg + ";background:" + badgeBg + ';border-radius:6px;padding:3px 10px;white-space:nowrap;flex:none">' + label + "</span>" +
          '<button data-act="close" aria-label="닫기" style="margin-left:auto;width:32px;height:32px;margin-right:-8px;display:flex;align-items:center;justify-content:center;color:var(--t2);cursor:pointer;flex:none;background:none;border:0"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"></path></svg></button></div>' +
          '<div style="margin-top:2px;padding-left:24px;font-size:12.5px;color:var(--m1)">차감은 분석 시작을 누를 때 딱 한 번</div>' +
          '<div style="margin-top:4px;font-size:13px;color:var(--t2);line-height:1.6"><b style="color:var(--t1)">' + label + " 분석은 그대로</b>예요. 어디를 크게 볼지만 고릅니다.</div>" +
          '<div style="display:flex;align-items:baseline;gap:8px;padding:12px 0 8px"><span style="font-size:12.5px;font-weight:700;color:var(--t2);white-space:nowrap">스타일 추천</span><span style="font-size:11.5px;color:var(--m1);white-space:nowrap">단계가 아니에요 · 하나만 고르면 됩니다</span></div>' +
          '<div style="display:flex;flex-direction:column;gap:8px">' +
          topCard("전체 종합", "표준", "var(--t2)", "32개를 고르게 봅니다 · 고민되면 이걸로") +
          topCard("추세 중심", "요즘 잘 맞음", "var(--up)", "최근 90일 적중 1위 스타일") +
          (function () {
            const st2 = MS.store.get();
            const ans2 = (st2.personaAns || []).slice(0, st2.personaIdx || 0);
            const sug = ans2.length ? MS.persona.suggestPreset(ans2, MS.engine.PRESETS) : null;
            return sug ? topCard(sug, "내 성향", "var(--cu)", "내 페르소나(" + MS.persona.chips(ans2).slice(0, 2).map(function (c) { return c.label; }).join(" · ") + ")와 가장 가까운 스타일")
                       : topCard(null, "내 성향", "var(--cu)", "페르소나 질문에 답하면 내 성향 추천이 열려요", true);
          })() +
          "</div>" +
          '<button data-act="more" style="margin-top:12px;display:flex;align-items:center;gap:10px;min-height:50px;border:1px solid rgba(123,108,255,0.45);border-radius:12px;background:rgba(123,108,255,0.07);padding:0 14px;cursor:pointer;width:100%;font-family:inherit;letter-spacing:inherit;text-align:left">' +
          '<span style="width:26px;height:26px;border-radius:8px;background:rgba(123,108,255,0.15);display:flex;align-items:center;justify-content:center;flex:none"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="var(--ac)" stroke-width="2.2" stroke-linecap="round"><path d="M4 6h16M4 12h10M4 18h6"></path></svg></span>' +
          '<span style="min-width:0"><span style="display:block;font-size:13.5px;font-weight:700;color:var(--t1);white-space:nowrap">9가지 스타일 직접 고르기</span>' +
          '<span style="display:block;font-size:11.5px;color:' + (topNames.indexOf(sel) < 0 ? "var(--ac)" : "var(--m1)") + ';white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + (topNames.indexOf(sel) < 0 ? "선택: " + esc(sel) : "추세 · 모멘텀 · 거래량 · 단타 · 장기…") + "</span></span>" +
          '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="var(--ac)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="margin-left:auto;transform:' + (moreOn ? "rotate(180deg)" : "none") + ';transition:transform 0.2s;flex:none"><path d="M6 9l6 6 6-6"></path></svg></button>' +
          (moreOn ?
            '<div style="margin-top:10px;display:flex;flex-wrap:wrap;gap:8px 12px;font-size:12.5px;color:var(--t2)">' +
            CN.map(function (n, i) { return '<span style="display:flex;align-items:center;gap:4px"><span style="width:9px;height:9px;border-radius:2px;background:' + CAT[i] + '"></span>' + n + "</span>"; }).join("") +
            '<span style="color:var(--m1);white-space:nowrap">— 띠가 넓을수록 크게 봅니다</span></div>' +
            '<div style="margin-top:10px;display:grid;grid-template-columns:1fr 1fr;gap:8px">' +
            MS.engine.PRESETS.map(function (p) {
              const on = sel === p.name;
              const sum = p.prof.reduce(function (a, b) { return a + b; }, 0);
              const mx = Math.max.apply(null, p.prof);
              const even = p.prof.every(function (v) { return v === p.prof[0]; });
              const ti = p.prof.indexOf(mx);
              const josa = (CN[ti].charCodeAt(CN[ti].length - 1) - 0xAC00) % 28 > 0 ? "을" : "를";
              return '<div data-preset="' + esc(p.name) + '" style="border:1px solid ' + (on ? "rgba(123,108,255,0.6)" : "var(--ln1)") + ";border-radius:12px;background:" + (on ? "rgba(123,108,255,0.1)" : "var(--sf2)") + ';padding:12px;cursor:pointer">' +
                '<div style="display:flex;align-items:center;gap:8px"><span style="font-size:13.5px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0">' + esc(p.name) + '</span><span style="margin-left:auto;font-size:12.5px;color:var(--ac);white-space:nowrap;flex:none">' + (on ? "선택 ✓" : "") + "</span></div>" +
                '<div style="margin-top:8px;display:flex;align-items:center;gap:5px"><span style="width:8px;height:8px;border-radius:50%;background:' + (even ? "var(--t2)" : CAT[ti]) + ';flex:none"></span><span style="font-size:12px;font-weight:600;color:' + (even ? "var(--t2)" : CAT[ti]) + ';white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + (even ? "고르게 배분" : CN[ti] + josa + " 가장 크게") + "</span></div>" +
                '<div style="margin-top:6px;display:flex;height:7px;border-radius:4px;overflow:hidden;background:var(--sf3)">' +
                p.prof.map(function (v, i) {
                  return '<span style="width:' + Math.round(v / sum * 100) + "%;background:" + CAT[i] + ";opacity:" + (on ? "1" : (i === ti && !even ? "0.9" : "0.35")) + '"></span>';
                }).join("") + "</div>" +
                '<div style="margin-top:8px;font-size:12.5px;color:var(--t2);line-height:1.5">' + esc(p.desc) + "</div></div>";
            }).join("") + "</div>"
            : "") +
          '<div style="height:12px"></div>';

        // 하단 고정 CTA
        let cta = sheet.querySelector(".ms-sheet-cta");
        if (!cta) { cta = document.createElement("div"); cta.className = "ms-sheet-cta"; sheet.appendChild(cta); }
        cta.innerHTML =
          '<button data-act="go" class="ms-cta-primary big" style="flex-direction:row;gap:12px"><span class="t">' + esc(sel) + "으로 " + label + ' 분석</span><span style="font-size:13.5px;font-weight:600;color:rgba(255,255,255,0.9)">' +
          (tier === "custom" ? "비중 조절로 →" : free ? "무차감" : "◈ " + cost + " 차감") + "</span></button>" +
          '<div style="margin-top:8px;font-size:13px;color:var(--t2);text-align:center">남은 스쿱 <b class="mono" style="color:var(--t1)">' + s.scoops + " → " + (free || tier === "custom" ? s.scoops : s.scoops - cost) + "</b> · 실패하면 자동으로 돌려드립니다</div>";

        body.querySelector('[data-act="back"]').addEventListener("click", function () { MS.ui.closeSheet(); openTier(); });
        body.querySelector('[data-act="close"]').addEventListener("click", MS.ui.closeSheet);
        body.querySelector('[data-act="more"]').addEventListener("click", function () { more = !moreOn; render(); });
        body.querySelectorAll("[data-top]").forEach(function (el) {
          el.addEventListener("click", function () {
            const n = el.getAttribute("data-top");
            if (!n) { MS.ui.closeSheet(); MS.ui.flash("홈의 페르소나 카드에서 질문에 답해 보세요", ""); return; }
            MS.store.set({ preset: n }); render();
          });
        });
        body.querySelectorAll("[data-preset]").forEach(function (el) {
          el.addEventListener("click", function () { MS.store.set({ preset: el.getAttribute("data-preset") }); render(); });
        });
        cta.querySelector('[data-act="go"]').addEventListener("click", function () { confirmDeduct(tier); });
      }
      render();
    });
  }

  // ── 차감 확인(1050ms 자동 진행) → 실행 ──
  function confirmDeduct(tier) {
    if (guardRun()) return;
    const s = MS.store.get();
    if (tier === "custom") {   // 커스텀은 비중 조절로(차감은 runCustom 시점 — 03 §1-3)
      MS.ui.closeSheet();
      MS.router.go("mix");
      MS.ui.flash("비중을 조절한 뒤 분석을 시작하세요. 아직 차감 전이에요", "");
      return;
    }
    startPaidRun("deep");
  }

  // 심화·커스텀 공통: 무차감(live) 분기 → 아니면 deduct 오버레이(1050ms)와 서버 차감 병행 → 실행
  // 차감은 서버 트랜잭션(멱등키 — 치환표 전역 규칙 ③). 네트워크 불가 시 로컬 폴백(MS.wallet).
  function startPaidRun(tier, mixOpts) {
    const s = MS.store.get();
    const cost = tier === "deep" ? P().scoop.costDeep : P().scoop.costCustom;
    const req = { symbol: s.ticker, tfKo: s.tf, tier: tier, preset: s.preset || "전체 종합",
      weights: mixOpts ? mixOpts.weights : null, personaApply: mixOpts ? mixOpts.personaApply : false,
      personaGW: mixOpts ? mixOpts.personaGW : null,
      paid: 0, spendInfo: null };
    if (liveFree()) { MS.ui.closeSheet(); MS.runStart(req); return; }
    if (s.scoops < cost) { MS.ui.hap("warn"); openShort(tier); return; }
    MS.ui.closeSheet();
    const app = document.getElementById("msApp");
    const ov = document.createElement("div");
    ov.style.cssText = "position:absolute;inset:0;z-index:70;background:rgba(6,7,10,0.82);display:flex;align-items:center;justify-content:center";
    ov.innerHTML =
      '<div style="width:280px;border:1px solid var(--ln2);border-radius:14px;background:var(--sf1);padding:22px 20px;text-align:center;box-shadow:0 24px 60px rgba(0,0,0,0.7)">' +
      '<div style="display:flex;align-items:center;justify-content:center;gap:16px">' +
      '<span class="mono" style="font-size:18px;color:var(--m1);text-decoration:line-through">◈ ' + s.scoops + "</span>" +
      '<span style="color:var(--m2)">→</span>' +
      '<span class="mono" style="font-size:26px;font-weight:700;color:var(--ac);text-shadow:0 0 18px rgba(123,108,255,0.45)">◈ ' + (s.scoops - cost) + "</span></div>" +
      '<div style="margin-top:12px;font-size:13.5px;color:var(--t1)">◈ ' + cost + " 차감 · " + TIER_LABEL[tier] + " 분석을 시작합니다</div>" +
      '<div style="margin-top:4px;font-size:13px;color:var(--m1)">' + esc(req.preset) + " 관점</div></div>";
    app.appendChild(ov);
    const t0 = Date.now();
    MS.wallet.spend(tier, s.ticker + "|" + s.tf).then(function (sp) {
      const wait = Math.max(0, 1050 - (Date.now() - t0));
      setTimeout(function () {
        if (ov.parentNode) ov.parentNode.removeChild(ov);
        if (!sp.ok) {
          MS.ui.hap("warn");
          if (sp.reason === "insufficient") { openShort(tier); MS.ui.flash("스쿱이 부족해요", ""); }
          else MS.ui.flash("차감에 실패했어요 — 잠시 뒤 다시 시도해 주세요", "");
          return;
        }
        MS.ui.hap("deduct");
        MS.ui.flash("◈ " + cost + " 차감 · 분석을 시작합니다", "−" + cost);
        req.paid = sp.cost;
        req.spendInfo = sp;
        MS.runStart(req);
      }, wait);
    });
  }

  // ── 부족 시트 ──
  function openShort(wantTier) {
    const s = MS.store.get();
    const key = s.ticker + "|" + s.tf;
    const rep = MS.reports && MS.reports[key];
    const v = rep ? rep.verdict : null;
    MS.ui.openSheet("short", function (body) {
      body.innerHTML =
        '<div style="margin-top:4px;border-radius:14px;background:var(--sf2);padding:12px;display:flex;align-items:center;gap:8px">' +
        '<span style="font-weight:700;font-size:13.5px">' + esc(s.ticker) + "</span>" +
        (v ? '<span style="font-size:13.5px;font-weight:700;color:' + (v.dir === "up" ? "var(--up)" : v.dir === "down" ? "var(--dn)" : "var(--t2)") + '">' + (v.dir === "up" ? "▲ 상승" : v.dir === "down" ? "▼ 하락" : "— 중립") + "</span>" : "") +
        '<span style="margin-left:auto;font-size:12.5px;color:var(--m1)">스쿱이 부족해요 · ◈ ' + s.scoops + "</span></div>" +
        '<div style="margin-top:16px;font-size:18px;font-weight:700;letter-spacing:-0.02em">' + esc(s.ticker) + "에서 지금 못 보고 있는 것</div>" +
        '<div style="margin-top:8px;font-size:13.5px;color:var(--t1);line-height:1.8">· 확신도<br>· 세 시점 · 내일 · 1주 · 1개월<br>· 반대 의견 · 어떤 지표가 반대하는지<br>· 지표 해설 ' + MS.engine.indicatorCount() + '개</div>' +
        '<div style="margin-top:16px;display:flex;flex-direction:column;gap:8px">' +
        '<button data-act="ad" style="min-height:54px;border-radius:12px;border:1px solid rgba(123,108,255,0.45);background:rgba(123,108,255,0.1);display:flex;align-items:center;justify-content:center;gap:8px;cursor:pointer;font-family:inherit;letter-spacing:inherit"><span style="font-size:15px;font-weight:600;color:var(--ac)">광고 1편 보기</span><span style="font-size:13px;color:var(--ac)">+' + P().scoop.ad.scoop + '스쿱</span><span style="font-size:13px;color:var(--up)">+' + P().scoop.ad.xp + "XP</span></button>" +
        '<div style="min-height:54px;border-radius:12px;border:1px solid var(--ln2);background:var(--sf2);display:flex;align-items:center;justify-content:center;gap:8px"><span style="font-size:15px;font-weight:600">다음 출석까지</span><span class="mono" style="font-size:13.5px;color:var(--ac)">—</span><span class="mono" style="font-size:13px;color:var(--t2)">+1</span></div>' +
        '<button data-act="basic" style="min-height:54px;border-radius:12px;border:1px solid var(--ln2);background:var(--sf2);display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:600;cursor:pointer;font-family:inherit;letter-spacing:inherit;color:inherit">기본 분석으로 계속</button></div>' +
        '<div style="margin:12px 0 4px;font-size:12.5px;color:var(--m1);text-align:center">보상은 확인 후 바로 적립됩니다</div>';
      body.querySelector('[data-act="ad"]').addEventListener("click", function () {
        MS.ui.flash("광고 보상은 다음 단계에서 열려요", "");   // P5: AdMob 연동으로 교체
      });
      body.querySelector('[data-act="basic"]').addEventListener("click", function () {
        if (guardRun()) return;
        MS.ui.closeSheet();
        const st = MS.store.get();
        MS.runStart({ symbol: st.ticker, tfKo: st.tf, tier: "basic" });
      });
    });
  }

  // ── mix 화면(커스텀 비중 조절) — 미니 차트는 엔진 실좌표 미리보기(R-B06) ──
  MS.router.register("mix", {
    mount: function (host) {
      host.className = "ob-wrap";
      let preview = null, previewT = null, candles = null;
      const s0 = MS.store.get();
      const weights = {}; MIX_ROWS.forEach(function (r) {
        weights[r.id] = (s0.weights && typeof s0.weights[r.id] === "number") ? s0.weights[r.id] : 1;
      });
      const checks = {}; MIX_ROWS.forEach(function (r) {
        checks[r.id] = (s0.checks && r.id in s0.checks) ? s0.checks[r.id] : 1;
      });
      function effWeights() {
        const out = {};
        MIX_ROWS.forEach(function (r) { out[r.id] = checks[r.id] ? weights[r.id] : 0; });
        return out;
      }
      function schedulePreview() {   // 슬라이더 조작 디바운스 → 가중 실행 미리보기
        if (previewT) clearTimeout(previewT);
        previewT = setTimeout(async function () {
          if (!candles) return;
          try {
            const st = MS.store.get();
            preview = await MS.engine.analyze({ symbol: st.ticker, tfKo: st.tf, tier: "custom",
              preset: st.preset || "전체 종합", weights: effWeights(), candles: candles });
            paintChart();
          } catch (e) { /* 미리보기 실패는 조용히 */ }
        }, 350);
      }
      function paintChart() {
        const el = host.querySelector('[data-bind="mixchart"]');
        if (!el || !candles) return;
        const m = MS.chart.build(candles, preview ? preview.prediction : null, {});
        el.innerHTML = MS.chart.svg(m, preview ? { cone: true, pred: true, ma: true, boll: true, p3: true, p2: true } : { ma: true, boll: true });
      }
      function render() {
        host.innerHTML =
          '<div class="ob-scroll" style="padding-bottom:120px">' +
          '<div data-bind="mixchart" style="height:200px;overflow:hidden;border-bottom:1px solid var(--ln0);background:var(--sf0)"></div>' +
          '<div style="display:flex;align-items:center;gap:8px;padding:14px 16px 0">' +
          '<button data-act="back" aria-label="뒤로" style="width:32px;height:32px;margin-left:-8px;display:flex;align-items:center;justify-content:center;color:var(--t2);cursor:pointer;flex:none;background:none;border:0"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M11 18l-6-6 6-6"></path></svg></button>' +
          '<span style="font-size:17px;font-weight:700;letter-spacing:-0.02em">지표 비중 조절</span>' +
          '<span style="font-size:12.5px;font-weight:800;color:#1a1204;background:linear-gradient(135deg,#ecca5e,#c1901a);border-radius:6px;padding:3px 10px;flex:none">커스텀</span>' +
          '<button data-act="close" aria-label="닫기" style="margin-left:auto;width:32px;height:32px;display:flex;align-items:center;justify-content:center;color:var(--t2);cursor:pointer;flex:none;background:none;border:0"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"></path></svg></button></div>' +
          '<div style="padding:4px 16px 0;font-size:12.5px;color:var(--m1)">0 = 제외 · ×3 = 세 배 크게 · 골드 선이 내 조합의 3차 예측</div>' +
          '<div style="margin:12px 16px 0;display:flex;flex-direction:column;gap:4px">' +
          MIX_ROWS.map(function (r) {
            const on = !!checks[r.id];
            const w = weights[r.id];
            return '<div style="display:flex;align-items:center;gap:10px;min-height:48px;padding:4px 12px;border-radius:10px;background:var(--sf1);opacity:' + (on ? 1 : 0.45) + '">' +
              '<button data-chk="' + r.id + '" aria-label="' + esc(r.n) + ' 포함" style="width:22px;height:22px;border-radius:6px;border:1.5px solid ' + (on ? "var(--cu)" : "var(--ln2)") + ";background:" + (on ? "rgba(210,165,22,0.2)" : "transparent") + ';color:var(--cu);font-size:12px;cursor:pointer;flex:none;display:flex;align-items:center;justify-content:center;padding:0">' + (on ? "✓" : "") + "</button>" +
              '<span class="mono" style="width:13px;flex:none;font-size:12px;color:' + (r.sign > 0 ? "var(--up)" : "var(--dn)") + '">' + (r.sign > 0 ? "▲" : "▼") + "</span>" +
              '<span style="flex:none;width:110px;font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(r.n) + "</span>" +
              '<input data-w="' + r.id + '" type="range" min="0" max="3" step="0.5" value="' + w + '" style="flex:1;accent-color:var(--cu)"' + (on ? "" : " disabled") + ">" +
              '<span class="mono" style="width:36px;flex:none;text-align:right;font-size:12.5px;color:' + (w !== 1 ? "var(--cu)" : "var(--m1)") + '">×' + w + "</span></div>";
          }).join("") + "</div>" +
          '<div style="margin:10px 16px 0;font-size:12px;color:var(--m2)">나머지 ' + (MS.engine.indicatorCount() - MIX_ROWS.length) + '개 지표는 ×1 기준으로 함께 계산됩니다</div>' +
          "</div>" +
          '<div class="ob-ctazone" style="bottom:0;padding-bottom:calc(16px + env(safe-area-inset-bottom))">' +
          '<button class="ms-cta-primary big" data-act="go" style="background:linear-gradient(135deg,#ecca5e,#c1901a);box-shadow:0 10px 26px -10px rgba(210,165,22,0.7)"><span class="t" style="color:#1a1204">이 조합으로 계속 →</span></button></div>';
        bind();
        paintChart();
      }
      function bind() {
        host.querySelector('[data-act="back"]').addEventListener("click", function () {
          MS.router.go("chart"); openPreset("custom");
        });
        host.querySelector('[data-act="close"]').addEventListener("click", function () {
          MS.store.set({ tier: null });
          MS.router.go("chart");
        });
        host.querySelectorAll("[data-chk]").forEach(function (b) {
          b.addEventListener("click", function () {
            const id = b.getAttribute("data-chk");
            checks[id] = checks[id] ? 0 : 1;
            persistMix(); render(); schedulePreview();
          });
        });
        host.querySelectorAll("[data-w]").forEach(function (inp) {
          inp.addEventListener("input", function () {
            const id = inp.getAttribute("data-w");
            const v = parseFloat(inp.value);
            weights[id] = isFinite(v) ? v : 1;
            const lbl = inp.parentNode.querySelector(".mono:last-child");
            if (lbl) { lbl.textContent = "×" + weights[id]; lbl.style.color = weights[id] !== 1 ? "var(--cu)" : "var(--m1)"; }
            persistMix(); schedulePreview();
          });
        });
        host.querySelector('[data-act="go"]').addEventListener("click", function () {
          MS.store.set({ screen: "pfit", _mixWeights: effWeights() });
          MS.router.go("pfit");
        });
      }
      function persistMix() {
        const w2 = {}, c2 = {};
        MIX_ROWS.forEach(function (r) { w2[r.id] = weights[r.id]; c2[r.id] = checks[r.id]; });
        MS.store.set({ weights: w2, checks: c2 });
        MS.store.persistSoon();
      }
      render();
      MS.data.ohlc.fetch(s0.ticker, s0.tf).then(function (r) {
        if (r.ok) { candles = r.candles; paintChart(); schedulePreview(); }
      }).catch(function () {});
    }
  });

  // ── pfit 화면(페르소나 반영 확인 — 실데이터·보정 내역 정직 표기) ──
  MS.router.register("pfit", {
    mount: function (host) {
      host.className = "ob-wrap";
      const s = MS.store.get();
      const answers = (s.personaAns || []).slice(0, s.personaIdx || 0);
      const has = answers.length > 0;
      const gw = has ? MS.persona.groupWeights(answers) : null;
      const GN = { t: "추세", m: "모멘텀", v: "변동성", q: "거래량", s: "구조" };
      let adjTxt = "";
      if (gw) {
        const parts = [];
        Object.keys(gw).forEach(function (k) {
          const p2 = Math.round((gw[k] - 1) * 100);
          if (p2 !== 0) parts.push(GN[k] + " " + (p2 > 0 ? "+" : "") + p2 + "%");
        });
        adjTxt = parts.length ? parts.join(" · ") : "성향이 고르게 분포 — 보정 없음";
      }
      host.innerHTML =
        '<div style="position:absolute;inset:0;background:rgba(6,7,10,0.5)"></div>' +
        '<div style="position:absolute;left:0;right:0;bottom:0;background:var(--sf1);border-radius:18px 18px 0 0;border-top:1px solid var(--ln2);padding:16px 16px calc(20px + env(safe-area-inset-bottom));box-shadow:0 -18px 50px rgba(0,0,0,0.6);animation:msSheetUp 0.42s cubic-bezier(0.32,1.28,0.42,1) both">' +
        '<div style="display:flex;align-items:center;gap:4px">' +
        '<button data-act="back" aria-label="뒤로" style="width:32px;height:32px;margin-left:-8px;display:flex;align-items:center;justify-content:center;color:var(--t2);cursor:pointer;flex:none;background:none;border:0"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M11 18l-6-6 6-6"></path></svg></button>' +
        '<span style="font-size:17px;font-weight:700;letter-spacing:-0.02em;color:var(--cu)">내 페르소나도 추가 적용</span>' +
        '<button data-act="close" aria-label="닫기" style="margin-left:auto;width:32px;height:32px;display:flex;align-items:center;justify-content:center;color:var(--t2);cursor:pointer;flex:none;background:none;border:0"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"></path></svg></button></div>' +
        (has ?
          '<div style="margin-top:12px;display:flex;gap:14px;align-items:center">' +
          '<div style="flex:none">' + MS.persona.radarSvg(answers, 110) + "</div>" +
          '<div style="min-width:0;flex:1"><div style="display:flex;flex-wrap:wrap;gap:4px">' +
          MS.persona.chips(answers).map(function (c) {
            return '<span style="font-size:11px;color:var(--cu);border:1px solid rgba(210,165,22,0.4);border-radius:99px;padding:3px 8px;white-space:nowrap">' + c.label + "</span>";
          }).join("") + "</div>" +
          '<div style="margin-top:8px;font-size:11.5px;color:var(--t2);line-height:1.6">반영 시 지표 가중이 미세 조정돼요:<br><b style="color:var(--cu)">' + adjTxt + "</b></div>" +
          '<div style="margin-top:4px;font-size:10px;color:var(--m2)">' + answers.length + "답 기준 · 답할수록 정교해져요</div></div></div>"
          :
          '<div style="margin-top:12px;border:1px dashed var(--ln2);border-radius:12px;padding:20px 16px;text-align:center">' +
          '<div style="font-size:13.5px;font-weight:600;color:var(--t3)">아직 답한 페르소나 질문이 없어요</div>' +
          '<div style="margin-top:6px;font-size:12.5px;color:var(--m1);line-height:1.6">홈의 페르소나 카드에서 질문에 답하면<br>내 성향 보정이 여기서 켜져요</div></div>') +
        '<div style="margin-top:14px;display:flex;flex-direction:column;gap:8px">' +
        '<button data-act="yes" class="ms-cta-primary" style="background:linear-gradient(135deg,#ecca5e,#c1901a)' + (has ? "" : ";opacity:0.45") + '"><span class="t" style="color:#1a1204">페르소나 반영해 분석</span></button>' +
        '<button data-act="no" style="min-height:52px;border-radius:12px;border:1px solid var(--ln2);background:var(--sf2);font-size:14.5px;font-weight:600;color:var(--t1);cursor:pointer;font-family:inherit">가중치만으로 분석</button></div></div>';
      host.querySelector('[data-act="back"]').addEventListener("click", function () { MS.router.go("mix"); });
      host.querySelector('[data-act="close"]').addEventListener("click", function () {
        MS.store.set({ tier: null }); MS.router.go("chart");
      });
      function goRun(apply) {
        if (guardRun()) return;
        const st = MS.store.get();
        startPaidRun("custom", { weights: st._mixWeights || {},
          personaApply: apply && has, personaGW: (apply && has) ? gw : null });
      }
      host.querySelector('[data-act="yes"]').addEventListener("click", function () {
        if (!has) { MS.ui.flash("홈의 페르소나 카드에서 질문에 답해 보세요", ""); return; }
        goRun(true);
      });
      host.querySelector('[data-act="no"]').addEventListener("click", function () { goRun(false); });
    }
  });

  // ── 전역 종목 진입점(담아둔 종목 + 검색·추가 시트 — 프로토 L2083~2128) ──
  // 헤더 ⌕ 종목·홈 추가·분석 서브헤더 ▾ 공용. 실행·조절 화면에서는 열지 않는다(지침서 §2 헤더 규칙).
  function openStocks() {
    const scr = MS.store.get().screen;
    if (scr === "run" || scr === "mix") return;
    const quotes = {};
    let q = "";
    MS.ui.openSheet("stocks", function (body) {
      function fetchQuotes(syms) {
        syms.forEach(function (sym) {
          if (quotes[sym]) return;
          MS.data.ohlc.fetch(sym, "일", { lite: true }).then(function (r) {   // 종목 시트 시세 — 경량
            if (r.ok) { quotes[sym] = MS.data.quote(r.candles); paintSheet(); }
          }).catch(function () {});
        });
      }
      function opGuard() {
        const dc = MS.store.get().dayCounters;
        if (dc.stockOps >= P().limits.stockOpsPerDay) {
          MS.ui.hap("warn");
          MS.ui.flash("오늘은 종목 변경을 다 썼어요 — 내일 다시", "");
          return false;
        }
        return true;
      }
      function bumpOps() {
        const s = MS.store.get();
        const dc = {};
        Object.keys(s.dayCounters).forEach(function (k) { dc[k] = s.dayCounters[k]; });
        dc.stockOps++;
        MS.store.set({ dayCounters: dc });
      }
      function addSym(sym, goChart) {
        const s = MS.store.get();
        if (s.picks.indexOf(sym) >= 0) {
          if (goChart) { MS.store.set({ ticker: sym }); MS.ui.closeSheet(); MS.router.go("chart"); }
          return;
        }
        if (s.picks.length >= P().limits.stocksMax) { MS.ui.hap("warn"); MS.ui.flash("가득 찼어요(12/12) — 하나를 빼고 추가하세요", ""); return; }
        if (!opGuard()) return;
        bumpOps();
        MS.store.set({ picks: s.picks.concat([sym]), ticker: s.ticker || sym });
        MS.store.persistSoon();
        MS.ui.hap("earn");
        MS.ui.flash(sym + " 을 담았어요", "");
        const dc0 = MS.store.get().dayCounters;
        if (dc0.stockAddXp < P().xp.stockAdd.perDay) {
          const dc3 = {};
          Object.keys(dc0).forEach(function (k3) { dc3[k3] = dc0[k3]; });
          dc3.stockAddXp++;
          MS.store.set({ dayCounters: dc3 });
          setTimeout(function () { MS.xp.add(P().xp.stockAdd.xp, "관심 종목 추가"); }, 350);
        }
        if (goChart) { MS.store.set({ ticker: sym }); MS.ui.closeSheet(); MS.router.go("chart"); }
        else paintSheet();
      }
      function paintSheet() {
        const s = MS.store.get();
        const picks = s.picks;
        const qq = q.trim().toLowerCase();
        const cands = MS.data.MASTER.filter(function (t) { return picks.indexOf(t.sym) < 0; })
          .filter(function (t) {
            if (!qq) return true;
            return t.sym.toLowerCase().indexOf(qq) >= 0 || t.name.indexOf(q.trim()) >= 0;
          });
        const full = picks.length >= P().limits.stocksMax;
        body.innerHTML =
          '<div style="display:flex;align-items:baseline;gap:8px;padding:4px 0 12px;border-bottom:1px solid var(--sf3)">' +
          '<span style="font-size:16px;font-weight:700">담아둔 종목</span>' +
          '<span class="mono" style="font-size:13px;color:var(--ac)">' + picks.length + '<span style="color:var(--m2)">/' + P().limits.stocksMax + "</span></span>" +
          '<span style="margin-left:auto;font-size:12.5px;color:var(--m1)">누르면 차트로</span></div>' +
          (!picks.length ?
            '<div style="margin:12px 0 0;border:1px dashed var(--ln2);border-radius:9px;padding:16px 12px;text-align:center;font-size:13px;color:var(--t2)">아직 고른 종목이 없어요. 아래에서 추가하세요</div>' : "") +
          picks.map(function (sym) {
            const t = MS.data.MASTER.filter(function (x) { return x.sym === sym; })[0];
            const qt = quotes[sym];
            const cur = s.ticker === sym;
            const done = !!s.analyzed[sym + "|일"] || !!s.analyzed[sym + "|주"] || !!s.analyzed[sym + "|월"];
            return '<div data-go="' + esc(sym) + '" style="display:flex;align-items:center;gap:8px;min-height:54px;padding:8px 0;border-bottom:1px solid var(--ln0);cursor:pointer">' +
              '<div style="width:96px"><div style="font-weight:700;font-size:13.5px">' + esc(sym) + '</div><div style="font-size:12.5px;color:var(--m1)">' + esc(t ? t.name : "") + "</div></div>" +
              (cur ? '<span style="font-size:11.5px;color:var(--ac);border:1px solid rgba(123,108,255,0.45);background:rgba(123,108,255,0.1);border-radius:99px;padding:2px 8px">보는 중</span>' : "") +
              (done ? '<span style="font-size:11.5px;color:var(--up);border:1px solid rgba(46,217,160,0.35);border-radius:99px;padding:2px 8px">분석됨</span>' : "") +
              '<div style="margin-left:auto;text-align:right"><div class="mono" style="font-size:13.5px">' + (qt ? fmtP(qt.price) : "—") + '</div><div class="mono" style="font-size:12.5px;color:' + (qt ? (qt.up ? "var(--up)" : "var(--dn)") : "var(--m2)") + '">' + (qt ? (qt.up ? "▲" : "▼") + Math.abs(qt.chg).toFixed(2) + "%" : "") + "</div></div>" +
              '<span data-del="' + esc(sym) + '" aria-label="관심 종목에서 삭제" role="button" style="width:28px;height:28px;display:flex;align-items:center;justify-content:center;border-radius:50%;color:var(--m1);cursor:pointer;flex:none"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" style="display:block"><path d="M6 6l12 12M18 6L6 18"></path></svg></span></div>';
          }).join("") +
          '<div style="margin:14px -16px 0;height:6px;background:var(--sf0)"></div>' +
          '<div style="padding:14px 0 10px;display:flex;align-items:baseline;gap:8px">' +
          '<span style="font-size:16px;font-weight:700">종목 추가</span>' +
          '<span style="font-size:12px;color:var(--m1)">미국 전 종목 · 주요 암호화폐</span></div>' +
          '<div style="display:flex;align-items:center;gap:8px;height:46px;border:1.5px solid rgba(123,108,255,0.45);border-radius:12px;background:var(--sf2);padding:0 12px">' +
          '<svg viewBox="0 0 24 24" width="15" height="15" style="flex:none;color:var(--ac)"><circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" stroke-width="1.8"></circle><path d="M15.8 15.8 20 20" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path></svg>' +
          '<input data-q placeholder="티커나 이름으로 검색 · 예: TSLA, 솔라나" value="' + esc(q) + '" style="flex:1;background:transparent;border:none;outline:none;color:var(--t1);font-size:13.5px;font-family:inherit"></div>' +
          (full ? '<div style="margin-top:4px;font-size:12.5px;color:var(--am)">내 관심 종목이 가득 찼어요(' + picks.length + "/" + P().limits.stocksMax + "). 하나를 빼면 추가할 수 있습니다</div>" : "") +
          (qq && !cands.length ?
            '<div style="margin-top:8px;border:1px dashed var(--ln2);border-radius:9px;padding:16px 12px;text-align:center;font-size:13px;color:var(--m1)">검색 결과가 없어요. 전 종목 검색은 곧 열립니다</div>' : "") +
          (!qq ? '<div style="padding:12px 0 4px;display:flex;align-items:baseline;gap:7px;font-size:12px"><span style="font-weight:600;color:var(--t2)">요즘 많이 담는 종목</span><span style="color:var(--m2)">맛보기예요 — 검색하면 모든 종목이 나옵니다</span></div>' : "") +
          cands.map(function (t) {
            const qt = quotes[t.sym];
            return '<div style="display:flex;align-items:center;gap:8px;min-height:50px;padding:8px 0;border-bottom:1px solid var(--ln0)">' +
              '<div style="width:96px"><div style="font-weight:600;font-size:13.5px;color:var(--t2)">' + esc(t.sym) + '</div><div style="font-size:12.5px;color:var(--m2)">' + esc(t.name) + "</div></div>" +
              '<div style="margin-left:auto;display:flex;align-items:center;gap:8px">' +
              '<span class="mono" style="font-size:13px;color:' + (qt ? (qt.up ? "var(--up)" : "var(--dn)") : "var(--m2)") + '">' + (qt ? (qt.up ? "▲" : "▼") + Math.abs(qt.chg).toFixed(2) + "%" : "—") + "</span>" +
              '<button data-add="' + esc(t.sym) + '" style="font-size:12.5px;color:var(--t2);border:1px solid var(--ln2);border-radius:7px;padding:8px 12px;background:none;cursor:pointer;font-family:inherit">추가만</button>' +
              '<button data-goadd="' + esc(t.sym) + '" style="font-size:12.5px;color:var(--ac);border:1px solid rgba(123,108,255,0.45);border-radius:7px;padding:8px 12px;background:none;cursor:pointer;font-family:inherit">바로 분석 →</button></div></div>';
          }).join("");

        body.querySelectorAll("[data-go]").forEach(function (el) {
          el.addEventListener("click", function (e) {
            if (e.target.closest("[data-del]")) return;
            MS.store.set({ ticker: el.getAttribute("data-go") });
            MS.ui.closeSheet();
            MS.router.go("chart");
          });
        });
        body.querySelectorAll("[data-del]").forEach(function (el) {
          el.addEventListener("click", function () {
            if (!opGuard()) return;
            const sym = el.getAttribute("data-del");
            const s2 = MS.store.get();
            const next = s2.picks.filter(function (p2) { return p2 !== sym; });
            bumpOps();
            MS.store.set({ picks: next, ticker: s2.ticker === sym ? (next[0] || null) : s2.ticker });
            MS.store.persistSoon();
            MS.ui.flash(sym + " 을 뺐어요", "");
            paintSheet();
          });
        });
        body.querySelectorAll("[data-add]").forEach(function (el) {
          el.addEventListener("click", function () { addSym(el.getAttribute("data-add"), false); });
        });
        body.querySelectorAll("[data-goadd]").forEach(function (el) {
          el.addEventListener("click", function () { addSym(el.getAttribute("data-goadd"), true); });
        });
        const inp = body.querySelector("[data-q]");
        inp.addEventListener("input", function () {
          q = inp.value;
          const pos = inp.selectionStart;
          paintSheet();
          const inp2 = body.querySelector("[data-q]");
          inp2.focus();
          try { inp2.setSelectionRange(pos, pos); } catch (e) {}
        });
        fetchQuotes(picks.concat(cands.slice(0, 6).map(function (t) { return t.sym; })));
      }
      paintSheet();
    });
  }
  function fmtP(v) {
    if (v == null || !isFinite(v)) return "—";
    return v >= 1000 ? Math.round(v).toLocaleString("en-US") : (Math.round(v * 100) / 100).toFixed(2);
  }

  MS.flow = { openTier: openTier, openShort: openShort, openStocks: openStocks,
    liveFree: liveFree, MIX_ROWS: MIX_ROWS };
})();
