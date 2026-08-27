/* 머니스쿱 앱 — 푸시 등록·인앱 확신도 랭킹(설계서 2026-08-26 Phase 1).
   푸시 자체는 네이티브 셸+Firebase(Phase 2)에서 켜진다. Phase 1 에서 이 파일이 하는 일은 둘:
   ① 등록부 송신(관심종목·알림설정) — 서버 스캐너가 무엇을 훑을지 알게 한다.
   ② 인앱 하이라이트 — 스캐너가 쓸 게이트(rankSignal)를 앱에서도 돌려 '엔진이 강하게 동의하는'
      시그널을 눈에 띄게 한다. 판정은 스캐너와 같은 계약(전량 이력·일봉·POLICY.signal.verdictTier).
   판정 비용 실측(2026-08-27): NVDA 5,030봉 basic 82ms — 관심종목 전량을 훑어도 부담 없다. */
(function () {
  "use strict";
  const MS = (window.MS = window.MS || {});
  const vCache = Object.create(null);   // 'SYM|barT' → {regime, prob} (세션 메모리 — 봉이 바뀌면 자동 무효)
  let regTimer = null;

  async function register() {
    const s = MS.store.get();
    try {
      await MS.data.api("push_register", { picks: s.picks || [], on: s.notiOff ? false : true });
    } catch (e) { /* 오프라인·서버 미배포 — 등록은 다음 기회에(조용히) */ }
  }
  function registerSoon() {
    if (regTimer) clearTimeout(regTimer);
    regTimer = setTimeout(function () { regTimer = null; register(); }, 3000);
  }

  // 종목 판정(스캐너와 같은 계약: 전량 이력 · 일봉 · POLICY.signal.verdictTier)
  async function verdictOf(sym, barT) {
    const ck = sym + "|" + barT;
    if (vCache[ck]) return vCache[ck];
    const r = await MS.data.ohlc.fetch(sym, "일");            // 전량(경량 캐시는 자동 승격)
    if (!r.ok || !r.candles || r.candles.length < 24) return null;
    const rep = await MS.engine.analyze({ symbol: sym, tfKo: "일",
      tier: MS.config.POLICY.signal.verdictTier, candles: r.candles });
    const v = { regime: rep.verdict.regime, prob: rep.verdict.prob };
    vCache[ck] = v;
    return v;
  }

  // 시그널 목록에 확신도 부여. 종목 단위로 순차 처리(한 번에 한 종목 — 저사양 기기 배려),
  // 종목 하나가 끝날 때마다 onProgress 로 부분 결과를 흘려보내 화면이 점진적으로 채워지게 한다.
  async function rankList(list, onProgress) {
    const out = Object.create(null);
    const bySym = Object.create(null);
    (list || []).forEach(function (x) { (bySym[x.sym] = bySym[x.sym] || []).push(x); });
    const syms = Object.keys(bySym);
    for (let i = 0; i < syms.length; i++) {
      const sym = syms[i];
      const rows = bySym[sym];
      let v = null;
      try { v = await verdictOf(sym, rows[0].barT); } catch (e) { v = null; }
      if (!v) continue;                                       // 판정 실패 종목은 표시 없음(지어내지 않는다)
      rows.forEach(function (x) {
        const r = MS.signals.rankSignal(x, v);
        out[x.key] = { important: r.important, score: r.score, prob: v.prob };
      });
      if (onProgress) onProgress(out);
    }
    return out;
  }

  function impCount(rank) {
    let n = 0;
    Object.keys(rank || {}).forEach(function (k) { if (rank[k].important) n++; });
    return n;
  }

  MS.push = { register: register, registerSoon: registerSoon, rankList: rankList, impCount: impCount };
})();
