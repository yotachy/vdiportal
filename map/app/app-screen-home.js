/* 머니스쿱 앱 — 홈(오늘의 종목 스쿱) v1.
   원본: 프로토 dash L1370~1629. P1 범위: 히어로 3카드(관심종목=실데이터 · 시그널/채점=상태 자리) ·
   주간 분석/연속 방문 · 내 관심 종목 그리드(실시세) · 분석 현황 매트릭스(실기록) ·
   페르소나 카드 자리(게스트 티저 — P6) · 지연 고지·면책. 시그널/채점 실데이터는 P4/P3. */
(function () {
  "use strict";
  const MS = (window.MS = window.MS || {});
  const str = MS.str;
  const TIER_C = { basic: "#8b93a7", deep: "#7b6cff", custom: "var(--cu)" };
  const TIER_N = { basic: "기본", deep: "심화", custom: "커스텀" };

  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;"); }
  function fmtPrice(v) {
    if (v == null || !isFinite(v)) return "—";
    return v >= 1000 ? Math.round(v).toLocaleString("en-US") : (Math.round(v * 100) / 100).toFixed(2);
  }
  function fmtChg(c) { return (c >= 0 ? "▲" : "▼") + Math.abs(c).toFixed(2) + "%"; }

  let homeUnsub = null;   // picks 변경 시 홈 재렌더 구독 — 재마운트마다 정리(누수 방지)
  function mount(host, ctx) {
    if (homeUnsub) { homeUnsub(); homeUnsub = null; }
    let quotes = {};   // sym → {price, chg, up}
    let pqNext = null;   // 다음 페르소나 질문 프리페치 — 답하면 로딩 없이 바로 이어지게(화면 튐·재묻기 제거)
    const s0 = MS.store.get();

    function render() {
      const s = MS.store.get();
      const picks = s.picks;
      // 종목 0 이어도 홈은 홈으로 유지한다(전면 empty 화면으로 바꾸지 않는다 — 사용자 지시).
      // empty 안내는 종목 없이 존재 불가한 메뉴(분석/차트)에서만. 홈은 관심종목·매트릭스 칸만 안내로.
      const hasPicks = picks.length > 0;
      const _keepTop = host.scrollTop;   // 재렌더가 스크롤을 top 으로 튕기지 않게(페르소나 답변 등)
      const now = new Date();
      const meta = (now.getMonth() + 1) + "." + now.getDate() + " " +
        String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0") + " 기준";

      // 히어로1 — 실등락 집계
      const qs = picks.map(function (p) { return quotes[p]; }).filter(Boolean);
      const upN = qs.filter(function (q) { return q.up; }).length;
      const dnN = qs.length - upN;
      const avg = qs.length ? qs.reduce(function (a, q) { return a + q.chg; }, 0) / qs.length : null;
      let top = null;
      qs.forEach(function (q, i) { if (!top || Math.abs(q.chg) > Math.abs(top.chg)) top = { sym: picks[i], chg: q.chg }; });
      const upW = qs.length ? Math.round(upN / qs.length * 100) : 50;
      // 분석 현황 매트릭스가 통째로 비었는지(t·만료 하나도 없음) — 비었으면 죽은 범례 대신 첫 분석 안내
      const anyAnal = picks.some(function (p) {
        return ["일", "주", "월"].some(function (tf) { const k = p + "|" + tf; return s.analyzed[k] || s.analyzedAt[k]; });
      });

      // 채점 카드 — 서버 원장 실값(로드 전엔 로컬 근사)
      const dueN = s.scoreDueN || 0;
      const waitN = (s.scoreWaitN != null) ? s.scoreWaitN :
        Object.keys(s.analyzed).filter(function (k) { return s.analyzed[k] !== "basic"; }).length;
      const todayAna = Object.keys(s.analyzedAt).filter(function (k) {
        return MS.state.dayKey(s.analyzedAt[k]) === MS.state.dayKey(Date.now());
      }).length;
      const streak = (s.dayCounters && s.dayCounters.streak) || 0;

      host.innerHTML =
        '<div style="padding-bottom:20px">' +
        '<div style="padding:16px 16px 0;animation:msRevealUp 0.55s cubic-bezier(0.2,0.8,0.25,1) both">' +
        '<div style="display:flex;align-items:baseline;gap:8px"><span style="font-size:19px;font-weight:700;letter-spacing:-0.03em;white-space:nowrap">' + str("home.todayTitle") + "</span>" +
        '<span class="mono" style="font-size:12px;color:var(--m1);white-space:nowrap">' + meta + "</span></div></div>" +

        // 히어로 3카드
        '<div style="display:flex;gap:8px;padding:12px 16px 0;animation:msRevealUp 0.55s cubic-bezier(0.2,0.8,0.25,1) 0.08s both">' +
        '<div style="flex:1;min-width:0;border-radius:14px;background:var(--sf1);padding:12px;position:relative;overflow:hidden">' +
        '<div style="position:absolute;inset:0;background:radial-gradient(130% 90% at 0% 0%,rgba(46,217,160,0.12),transparent 58%)"></div>' +
        '<div style="position:relative">' +
        '<div style="display:flex;align-items:center;gap:8px;font-size:12.5px;color:var(--m1)"><span style="position:relative;width:6px;height:6px;flex:none"><span style="position:absolute;inset:0;border-radius:50%;background:var(--up)"></span><span style="position:absolute;inset:0;border-radius:50%;background:var(--up);animation:msPing 2.4s ease-out infinite"></span></span>오늘의 관심종목</div>' +
        '<div class="mono" style="margin-top:8px;font-size:22px;font-weight:700;color:' + (avg == null ? "var(--m1)" : avg >= 0 ? "var(--up)" : "var(--dn)") + ';line-height:1">' + (avg == null ? "—" : (avg >= 0 ? "+" : "") + avg.toFixed(2) + "%") + "</div>" +
        '<div style="margin-top:8px;display:flex;align-items:center;gap:4px"><span class="mono" style="font-size:11.5px;color:var(--up);flex:none">' + upN + '▲</span><div style="flex:1;display:flex;gap:2px;height:5px;border-radius:3px;overflow:hidden;background:var(--sf3)"><span style="width:' + upW + '%;background:var(--up)"></span><span style="width:' + (100 - upW) + '%;background:var(--dn)"></span></div><span class="mono" style="font-size:11.5px;color:var(--dn);flex:none">' + dnN + "▼</span></div>" +
        '<div class="mono" style="margin-top:8px;font-size:11.5px;color:' + (top ? (top.chg >= 0 ? "var(--up)" : "var(--dn)") : "var(--m2)") + ';white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + (top ? esc(top.sym) + " " + fmtChg(top.chg) : (hasPicks ? "시세 불러오는 중" : "종목을 담아보세요")) + "</div>" +
        "</div></div>" +
        (function () {
          const all = s.sigList || [];
          const today = MS.state.dayKey(Date.now());
          const tn = all.filter(function (x) { return x.barT === today; }).length;
          const lastSig = all[0];
          return heroStub("오늘의 시그널", "var(--ac)", "rgba(123,108,255,0.1)",
            '<span class="mono" style="font-size:22px;font-weight:700;color:var(--ac);line-height:1">' + tn + '</span><span style="font-size:12.5px;color:var(--t2)">건</span>',
            lastSig ? esc(lastSig.sym) + " " + esc(lastSig.title) : "최근 3일 감지 없음",
            "감지 내역 보기", "sig");
        })() +
        '<div data-act="score" style="flex:1;min-width:0;border:1px solid rgba(255,176,32,0.4);border-radius:12px;background:var(--sf1);padding:12px;position:relative;overflow:hidden;cursor:pointer">' +
        '<div style="position:absolute;inset:0;background:radial-gradient(130% 90% at 100% 0%,rgba(255,176,32,0.13),transparent 60%)"></div>' +
        '<div style="position:relative">' +
        '<div style="display:flex;align-items:center;gap:8px;font-size:12.5px;color:var(--t2)"><span style="position:relative;width:6px;height:6px;flex:none"><span style="position:absolute;inset:0;border-radius:50%;background:var(--am)"></span><span style="position:absolute;inset:0;border-radius:50%;background:var(--am);animation:msPing 2.4s ease-out infinite"></span></span>오늘의 채점</div>' +
        '<div style="margin-top:8px;display:flex;align-items:baseline;gap:4px"><span class="mono" style="font-size:22px;font-weight:700;color:var(--am);line-height:1">' + dueN + '</span><span style="font-size:12.5px;color:var(--t2)">건</span><span class="mono" style="margin-left:auto;font-size:12px;color:var(--ac);white-space:nowrap;flex:none">예정 ' + waitN + "</span></div>" +
        '<div class="mono" style="margin-top:8px;font-size:13px;color:var(--am);letter-spacing:0.02em">' + (dueN ? "오늘 확인하세요" : waitN ? "다음 마감 후" : "—") + "</div>" +
        '<div style="margin-top:4px;font-size:11.5px;color:var(--m1);white-space:nowrap">' + (dueN || waitN ? "채점 보기" : "채점은 심화부터") + " ›</div>" +
        "</div></div>" +
        "</div>" +

        // 주간 분석 · 연속 방문
        '<div style="margin:8px 16px 0;border-radius:14px;background:var(--sf1);display:flex;animation:msRevealUp 0.55s cubic-bezier(0.2,0.8,0.25,1) 0.16s both">' +
        '<div data-act="chart" style="flex:1;min-width:0;padding:12px 12px 8px;cursor:pointer">' +
        '<div style="font-size:11.5px;color:var(--m1);white-space:nowrap">이번 주 분석</div>' +
        '<div style="margin-top:4px;display:flex;align-items:flex-end;gap:2.4px;height:20px">' +
        [0, 0, 0, 0, 0, 0].map(function () { return '<span style="flex:1;height:12%;background:var(--sf3);border-radius:2px 2px 0 0"></span>'; }).join("") +
        '<span style="flex:1;height:' + Math.min(100, 12 + todayAna * 30) + '%;background:var(--ac);border-radius:2px 2px 0 0"></span></div>' +
        '<div style="margin-top:4px;font-size:11px;color:var(--m2);white-space:nowrap">오늘 ' + todayAna + "건 분석</div></div>" +
        '<div style="width:1px;background:var(--ln0);margin:8px 0"></div>' +
        '<div style="flex:0.9;min-width:0;padding:12px 12px 8px">' +
        '<div style="font-size:11.5px;color:var(--m1);white-space:nowrap">연속 방문</div>' +
        '<div style="margin-top:8px;display:flex;align-items:baseline;gap:4px"><span class="mono" style="font-size:16px;font-weight:700;color:var(--up);line-height:1">' + streak + '</span><span style="font-size:11.5px;color:var(--t2)">일째</span></div>' +
        '<div style="margin-top:8px;display:flex;gap:4px">' +
        [0, 1, 2, 3, 4, 5, 6].map(function (i) { return '<span style="width:6px;height:6px;border-radius:50%;background:' + (i < streak ? "var(--up)" : "var(--sf3)") + ';flex:none"></span>'; }).join("") + "</div>" +
        '<div style="margin-top:4px;font-size:10.5px;color:var(--m2);white-space:nowrap">7일 채우면 ◈+5</div></div></div>' +

        // 내 관심 종목
        '<div style="margin:16px 16px 0;display:flex;align-items:baseline;gap:8px">' +
        '<span style="font-size:15px;font-weight:700;letter-spacing:-0.02em;white-space:nowrap;flex:none">내 관심 종목</span>' +
        '<span class="mono" style="font-size:13px;color:var(--ac)">' + picks.length + "/" + MS.config.POLICY.limits.stocksMax + "</span>" +
        '<button data-act="add" style="margin-left:auto;font-size:13px;color:var(--ac);border:1px solid rgba(123,108,255,0.45);border-radius:99px;padding:4px 12px;cursor:pointer;white-space:nowrap;flex:none;background:none;font-family:inherit">＋ 추가</button></div>' +
        (hasPicks ? '<div data-home="grid" style="margin:8px 16px 0;display:grid;grid-template-columns:1fr 1fr;gap:4px">' +
        picks.map(function (p) {
          const q = quotes[p];
          const slots = ["일", "주", "월"].map(function (tf) {
            const t = s.analyzed[p + "|" + tf];
            return '<span style="font-size:10.5px;font-weight:600;color:' + (t ? TIER_C[t] : "var(--m3)") + ';white-space:nowrap">' + tf + (t ? " ✓" : "") + "</span>";
          }).join("");
          return '<div data-go="' + esc(p) + '" style="display:flex;align-items:center;gap:8px;min-height:44px;padding:4px 4px 4px 12px;border-radius:10px;background:var(--sf1);cursor:pointer">' +
            '<div style="flex:1;min-width:0"><div style="font-weight:700;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(p) + "</div>" +
            '<div style="margin-top:2px;display:flex;gap:4px">' + slots + "</div></div>" +
            '<div style="flex:none;text-align:right;min-width:0">' +
            '<div class="mono" style="font-size:12.5px;font-weight:600;white-space:nowrap">' + (q ? fmtPrice(q.price) : "—") + "</div>" +
            '<div class="mono" style="margin-top:1px;font-size:11.5px;font-weight:700;color:' + (q ? (q.up ? "var(--up)" : "var(--dn)") : "var(--m2)") + ';white-space:nowrap">' + (q ? fmtChg(q.chg) : "") + "</div></div>" +
            '<span data-del="' + esc(p) + '" style="width:30px;height:40px;display:flex;align-items:center;justify-content:center;color:var(--m2);cursor:pointer;flex:none"><svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" style="display:block"><path d="M6 6l12 12M18 6L6 18"></path></svg></span></div>';
        }).join("") + "</div>" +
        '<div style="margin:8px 16px 0;display:flex;gap:12px;font-size:11.5px;color:var(--m2)"><span>✓ = 분석완료 <span style="color:#8b93a7">●기본</span> <span style="color:#7b6cff">●심화</span> <span style="color:var(--cu)">●커스텀</span></span></div>'
        : '<div style="margin:8px 16px 0;border:1px dashed var(--ln2);border-radius:12px;padding:22px 16px;text-align:center">' +
          '<div style="font-size:13px;font-weight:600">아직 담아둔 종목이 없어요</div>' +
          '<div style="margin-top:6px;font-size:12px;color:var(--m1);line-height:1.6">종목을 담으면 오늘의 방향·시그널·채점이 여기에 모여요.</div>' +
          '<button class="ms-cta-primary" data-act="add" style="margin-top:14px;max-width:220px;margin-left:auto;margin-right:auto"><span class="t">종목 담으러 가기</span></button></div>') +

        // 분석 현황 매트릭스 (+페르소나 카드 — medium 이상 2컬럼, 지침서 §16)
        '<div class="ms-home-duo">' +
        '<div style="margin:16px 16px 0;border-radius:14px;background:var(--sf1);padding:12px">' +
        '<div style="display:flex;align-items:baseline;gap:8px">' +
        '<span style="font-size:15px;font-weight:700;letter-spacing:-0.02em;white-space:nowrap;flex:none">분석 현황</span>' +
        '<span style="font-size:11.5px;color:var(--m1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0">채워진 칸 = 오늘 볼 수 있는 결과</span></div>' +
        '<div style="display:flex;align-items:center;gap:8px;margin-top:8px"><span style="width:78px;flex:none"></span>' +
        ["일봉", "주봉", "월봉"].map(function (t) { return '<span style="flex:1;text-align:center;font-size:11.5px;color:var(--m2)">' + t + "</span>"; }).join("") + "</div>" +
        (hasPicks ? picks.map(function (p) {
          return '<div style="display:flex;align-items:center;gap:8px;margin-top:8px">' +
            '<span style="width:78px;flex:none;font-size:13px;font-weight:600">' + esc(p) + "</span>" +
            ["일", "주", "월"].map(function (tf) {
              const key = p + "|" + tf;
              const t = s.analyzed[key];
              const at = s.analyzedAt[key];
              const ttl = MS.config.POLICY.analysis.ttlMs;
              const expired = at && !t;
              let style, txt;
              if (t) {
                const age = (Date.now() - at) / ttl;
                style = "border:1px solid " + TIER_C[t] + ";background:transparent;color:" + TIER_C[t] +
                  (age < 0.33 ? ";box-shadow:0 0 8px -2px " + TIER_C[t] : "") +
                  (age > 0.7 ? ";animation:msCellOld 1.6s ease-in-out infinite" : "");
                txt = TIER_N[t];
              } else if (expired) {
                style = "border:1px dashed rgba(255,176,32,0.5);color:var(--am);background:transparent";
                txt = "만료";
              } else {
                style = "border:1px dashed var(--ln1);color:var(--m3);background:transparent";
                txt = "—";
              }
              return '<span data-cell="' + esc(p) + "|" + tf + '" style="flex:1;height:27px;border-radius:7px;display:flex;align-items:center;justify-content:center;font-size:11.5px;font-weight:600;cursor:pointer;' + style + '">' + txt + "</span>";
            }).join("") + "</div>";
        }).join("") +
        (anyAnal
          ? '<div style="margin-top:8px;font-size:11.5px;color:var(--m2)"><span style="color:#8b93a7">●</span> 기본 · <span style="color:#7b6cff">●</span> 심화 · <span style="color:var(--cu)">●</span> 커스텀 — 24시간이 지나면 자동 폐기</div>'
          : '<div style="margin-top:10px;font-size:12px;color:var(--m1);line-height:1.6;text-align:center;padding:6px 2px 2px">아직 분석 기록이 없어요<br><span style="color:var(--t2);font-weight:600">칸을 눌러 첫 분석을 시작하세요</span></div>')
          : '<div style="margin-top:10px;font-size:12px;color:var(--m1);line-height:1.6;text-align:center;padding:10px 4px 4px">종목을 담으면 분석 현황이 여기 모여요</div>') + '</div>' +

        // 페르소나 카드(P6 — 즉시 질문·풀 배급·게스트 3문 잠금)
        personaCardHtml() +
        "</div>" +

        // 푸터
        '<div style="margin:20px 16px 0;font-size:11px;color:var(--m2);line-height:1.7">시세는 지연될 수 있어요 · 예측은 참고용이며 투자 판단과 책임은 본인에게 있습니다.</div>' +
        "</div>";

      bind();
      if (_keepTop) host.scrollTop = _keepTop;   // 스크롤 위치 복원(화면 튐 방지)
    }

    // ── 페르소나 카드(지침서 §9·03 §6 — 총량 표기 금지) ──
    function personaCardHtml() {
      const s = MS.store.get();
      const P2 = MS.config.POLICY;
      const idx = s.personaIdx || 0;
      const answers = (s.personaAns || []).slice(0, idx);
      const guest = !s.gLinked;
      const gLock = guest && idx >= P2.limits.persona.guestMax;
      const dayN = MS.state.personaToday(s);
      const dayFull = !guest && dayN >= P2.limits.persona.perDay;
      const stage = MS.persona.stageOf(idx, P2.persona.stages, P2.persona.stageNames);
      const chips = MS.persona.chips(answers);
      const q = s._pq;   // 현재 로드된 질문 {i,q,opts,more}
      // 답하면 한도까지 다음 질문이 바로 이어진다(다시 물어보는 '받기' 버튼 없음 — 사용자 지시).
      // q.q 가 있어야 질문(빈 질문=은행 소진). 한도 진행은 아래 카운트로만 표현.
      const pqOn = !gLock && !dayFull && q && q.i === idx && q.q;

      let inner =
        '<div style="display:flex;align-items:center;gap:8px">' +
        '<span style="font-size:15px;font-weight:700;color:var(--cu)">투자 페르소나</span>' +
        '<span style="font-size:11.5px;color:var(--cu)">' + (guest ? "맛보기 " + Math.min(idx, P2.limits.persona.guestMax) + "/" + P2.limits.persona.guestMax
          : "정밀도 " + (stage.idx + 1) + "단계 「" + stage.name + "」 · " + idx + "답") + "</span>" +
        '<span data-act="peers" style="margin-left:auto;font-size:11.5px;color:var(--m1);cursor:pointer">통계 보기 →</span></div>' +
        '<div style="margin-top:8px;height:5px;border-radius:3px;background:var(--sf3);overflow:hidden"><span style="display:block;height:100%;width:' + stage.inPct + '%;background:linear-gradient(90deg,#7b6cff,#d2a516);border-radius:3px"></span></div>' +
        '<div style="margin-top:12px;display:flex;gap:14px;align-items:center">' +
        '<div style="flex:none">' + MS.persona.radarSvg(answers, 118) + "</div>" +
        '<div style="min-width:0;flex:1;display:flex;flex-wrap:wrap;gap:4px;align-content:flex-start">' +
        (chips.length ? chips.map(function (c) {
          return '<span style="font-size:11px;color:var(--cu);border:1px solid rgba(210,165,22,0.4);border-radius:99px;padding:3px 8px;white-space:nowrap">' + c.label + "</span>";
        }).join("") : '<span style="font-size:11.5px;color:var(--m2)">답할수록 성향이 그려져요</span>') +
        (chips.length ? '<span style="font-size:11px;color:var(--m2);border:1px dashed var(--ln2);border-radius:99px;padding:3px 8px;white-space:nowrap">+ 답할수록 추가</span>' : "") +
        "</div></div>";

      if (gLock) {
        inner += '<div data-act="plogin" style="margin-top:12px;border:1px dashed var(--ln2);border-radius:10px;padding:12px;text-align:center;cursor:pointer">' +
          '<div style="font-size:12.5px;font-weight:600;color:var(--t3)">맛보기가 끝났어요</div>' +
          '<div style="margin-top:4px;font-size:11.5px;color:var(--m1)">구글로 로그인하면 계속 답하고, 답이 커스텀 분석에 반영돼요</div></div>';
      } else if (dayFull) {
        inner += '<div style="margin-top:12px;border-radius:10px;background:var(--sf2);padding:12px;text-align:center;font-size:12px;color:var(--m1)">오늘 몫 ' + P2.limits.persona.perDay + "답을 다 했어요 — 내일 새 질문이 와요</div>";
      } else if (pqOn) {
        inner += '<div style="margin-top:12px;border:1px solid rgba(210,165,22,0.35);border-radius:10px;padding:12px;background:rgba(210,165,22,0.05)">' +
          '<div style="display:flex;align-items:center;gap:6px">' +
          (idx > 0 ? '<button data-act="pback" aria-label="이전 답 고치기" style="width:26px;height:26px;border:0;background:none;color:var(--m1);cursor:pointer;flex:none;font-size:14px;padding:0">←</button>' : "") +
          '<span style="font-size:13px;font-weight:600;line-height:1.5">' + esc(q.q) + "</span></div>" +
          '<div style="margin-top:10px;display:flex;flex-direction:column;gap:6px">' +
          q.opts.map(function (o, j) {
            return '<button data-pans="' + j + '" style="min-height:42px;border-radius:9px;border:1px solid var(--ln1);background:var(--sf2);color:var(--t1);font-size:12.5px;cursor:pointer;font-family:inherit;text-align:left;padding:0 14px">' + esc(o.n) + "</button>";
          }).join("") + "</div>" +
          '<div style="margin-top:8px;font-size:10.5px;color:var(--m2)">오늘 ' + dayN + "/" + P2.limits.persona.perDay + " · 답변 +1 경험치</div></div>";
      } else if (q && q.i === idx && !q.q) {
        inner += '<div style="margin-top:12px;border-radius:10px;background:var(--sf2);padding:12px;text-align:center;font-size:12px;color:var(--m1)">준비된 질문을 다 봤어요 — 새 질문이 계속 추가돼요</div>';
      } else {
        // 다음 질문 불러오는 사이(짧은 fetch) — 다시 묻지 않고 바로 이어짐. 진행은 카운트로.
        inner += '<div style="margin-top:12px;border-radius:10px;background:var(--sf2);padding:12px;text-align:center;font-size:12px;color:var(--m2)">다음 질문 불러오는 중… · 오늘 ' + dayN + "/" + P2.limits.persona.perDay + "</div>";
      }

      return '<div id="msPersonaCard" style="margin:16px 16px 0;border:1px solid rgba(210,165,22,0.3);border-radius:14px;background:var(--sf1);padding:16px">' + inner + "</div>";
    }

    function prefetchPersonaQ(i) {   // 다음 질문을 미리 받아 pqNext 에 캐시(답변 시 즉시 사용)
      if (pqNext && pqNext.i === i) return;
      MS.data.api("persona_q", { i: i }).then(function (r) {
        if (r && r.ok) pqNext = { i: i, q: r.q, opts: r.opts || [], more: r.more };
      }).catch(function () {});
    }
    function loadPersonaQ() {
      const s = MS.store.get();
      const idx = s.personaIdx || 0;
      if (s._pq && s._pq.i === idx) { prefetchPersonaQ(idx + 1); render(); return; }
      MS.data.api("persona_q", { i: idx }).then(function (r) {
        if (r && r.ok) {
          MS.store.set({ _pq: { i: idx, q: r.q, opts: r.opts || [], more: r.more } });
          if (MS.store.get().screen === "home") render();
          prefetchPersonaQ(idx + 1);
        }
      }).catch(function () {});
    }

    function bindPersona() {
      const s = MS.store.get();
      host.querySelectorAll("[data-pans]").forEach(function (b) {
        b.addEventListener("click", function () {
          const j = parseInt(b.getAttribute("data-pans"), 10);
          const st = MS.store.get();
          const q = st._pq;
          if (!q || !q.opts[j]) return;
          const ans = (st.personaAns || []).slice();
          const fresh = !ans[st.personaIdx || 0];   // 이전 답 고치기(←)로 돌아온 재답변은 새 답이 아니다
          ans[st.personaIdx || 0] = { j: j, d: q.opts[j].d, l: q.opts[j].l, t: Date.now() };
          MS.ui.hap("tick");
          const newIdx = (st.personaIdx || 0) + 1;
          // 프리페치된 다음 질문이 있으면 바로 붙인다 — 로딩·화면 튐·재묻기 없이 즉시 이어짐
          const next = (pqNext && pqNext.i === newIdx && pqNext.q) ? pqNext : null;
          pqNext = null;
          MS.store.set({ personaAns: ans, personaIdx: newIdx, _pq: next, _pqPull: 0 });
          MS.store.persistSoon();
          if (fresh) MS.xp.add(MS.config.POLICY.xp.personaAnswer, "페르소나");
          if (!q.more) MS.ui.flash("답변 저장 · 커스텀 분석이 나에게 맞춰집니다", "");
          render();
          loadPersonaQ();   // next 없었으면 fetch, 있었으면 다음 것 프리페치만
        });
      });
      const pb = host.querySelector('[data-act="pback"]');
      if (pb) pb.addEventListener("click", function () {
        const st = MS.store.get();
        MS.store.set({ personaIdx: Math.max(0, (st.personaIdx || 0) - 1), _pq: null, _pqPull: 1 });
        MS.store.persistSoon();
        render();
        loadPersonaQ();
      });
      const pp = host.querySelector('[data-act="ppull"]');
      if (pp) pp.addEventListener("click", function () {
        MS.store.set({ _pqPull: 1 });
        render();
        loadPersonaQ();
      });
      const pl = host.querySelector('[data-act="plogin"]');
      if (pl) pl.addEventListener("click", function () { MS.auth.start(); });
      const pe = host.querySelector('[data-act="peers"]');
      if (pe) pe.addEventListener("click", function () { MS.router.go("stats"); });
    }

    function heroStub(title, dotC, tintBg, numHtml, line1, line2, act) {
      return '<div data-act="' + act + '" style="flex:1;min-width:0;border-radius:14px;background:var(--sf1);padding:12px;position:relative;overflow:hidden;cursor:pointer">' +
        '<div style="position:absolute;inset:0;background:radial-gradient(130% 90% at 50% 0%,' + tintBg + ',transparent 60%)"></div>' +
        '<div style="position:relative">' +
        '<div style="display:flex;align-items:center;gap:8px;font-size:12.5px;color:var(--m1)"><span style="position:relative;width:6px;height:6px;flex:none"><span style="position:absolute;inset:0;border-radius:50%;background:' + dotC + '"></span></span>' + title + "</div>" +
        '<div style="margin-top:8px;display:flex;align-items:baseline;gap:4px">' + numHtml + "</div>" +
        '<div style="margin-top:8px;font-size:11.5px;color:var(--t2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + line1 + "</div>" +
        '<div style="margin-top:4px;font-size:11.5px;color:var(--m1);white-space:nowrap">' + line2 + " ›</div></div></div>";
    }

    function bind() {
      host.querySelectorAll("[data-go]").forEach(function (el) {
        el.addEventListener("click", function (e) {
          if (e.target.closest("[data-del]")) return;
          MS.store.set({ ticker: el.getAttribute("data-go") });
          MS.router.go("chart");
        });
      });
      host.querySelectorAll("[data-del]").forEach(function (el) {
        el.addEventListener("click", function () {
          const s = MS.store.get();
          const sym = el.getAttribute("data-del");
          const next = s.picks.filter(function (p) { return p !== sym; });
          MS.store.set({ picks: next, ticker: next[0] || null });
          MS.store.persistSoon();
          MS.ui.flash(sym + " 을 뺐어요", "");
          render();
        });
      });
      host.querySelectorAll("[data-cell]").forEach(function (el) {
        el.addEventListener("click", function () {
          const kv = el.getAttribute("data-cell").split("|");
          MS.store.set({ ticker: kv[0], tf: kv[1] });
          MS.router.go("chart");
        });
      });
      ["signal", "score"].forEach(function (a) {
        const el = host.querySelector('[data-act="' + a + '"]');
        if (el) el.addEventListener("click", function () { MS.router.go(a); });
      });
      const addB = host.querySelector('[data-act="add"]');
      if (addB) addB.addEventListener("click", function () { MS.flow.openStocks(); });
      const ch = host.querySelector('[data-act="chart"]');
      if (ch) ch.addEventListener("click", function () { MS.router.go("chart"); });
      bindPersona();
    }

    render();
    // 관심종목이 바뀌면(시트·다른 화면에서 담거나 빼도) 홈이 즉시 반영 — 빈 홈에서 담으면 곧바로 채워지고,
    // 마지막 종목을 빼면 관심종목 안내 카드로 전환. 화면이 홈일 때만 렌더.
    homeUnsub = MS.store.subscribe(function (keys) {
      if (keys.indexOf("picks") >= 0 && MS.store.get().screen === "home") render();
    });
    // 채점 요약(서버) — 배지·히어로 실값
    MS.data.api("list", { limit: 200 }).then(function (r) {
      if (r && r.ok) {
        MS.store.set({ scoreDueN: r.cnt.due, scoreWaitN: r.cnt.wait });
        if (MS.store.get().screen === "home") render();
      }
    }).catch(function () {});
    loadPersonaQ();   // 하루 첫 답은 자동 노출(풀 배급 — 03 §6-2)
    // 시그널 스캔(캐시 공유 — 배지·히어로)
    if (s0.picks.length && MS.scanSignals) {
      MS.scanSignals().then(function () {
        if (MS.store.get().screen === "home") render();
      }).catch(function () {});
    }
    // 실시세 로드 → 재렌더
    if (s0.picks.length) {
      Promise.all(s0.picks.map(function (p) {
        return MS.data.ohlc.fetch(p, "일", { lite: true }).then(function (r) {   // 시세 표시용 — 경량(60봉)
          if (r.ok) quotes[p] = MS.data.quote(r.candles);
        }).catch(function () {});
      })).then(function () {
        if (MS.store.get().screen === "home") render();
      });
    }
  }

  MS.router.register("home", {
    mount: mount,
    refresh: function () { const h = document.querySelector("#msMain .ms-screen, #msMain .ob-wrap"); if (h) mount(h, {}); }
  });
})();
