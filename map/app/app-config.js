/* 머니스쿱 앱 — 정책 테이블(단일 출처).
   모든 정책 수치는 여기서만 산다. 화면·로직에 리터럴 금지(BUILD-PLAN §3).
   기준선 근거: docs/design-v2/dissection/01-state-data.md §4 전수표 + 확정 Q1~Q3(2026-08-24).
   전 수치는 서버 리모트 컨피그 대상 — applyRemote 가 서버 값을 덮어쓴다(지침서 §15). */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else { root.MS = root.MS || {}; root.MS.config = api; }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const POLICY = {
    app: { version: "1.0.0-rc1" },   // 스토어 릴리스 트랙에서 올린다(엔진 버전은 ForgeCore.version 라이브)
    scoop: {
      start: 15,                 // 가입 지급(= Lv.1 상한)
      capBase: 15,               // 상한 = capBase + (레벨-1)×capPerLevel
      capPerLevel: 2,
      costDeep: 2,               // 심화 ◈2
      costCustom: 3,             // 커스텀 ◈3
      checkin: { amount: 1, intervalSec: 21600 },   // 출석 +1 / 6시간
      streak: { days: 7, bonus: 5 },                // 연속 7일 +5
      ad: { scoop: 3, xp: 5 },                      // 광고 완주 ◈3 + XP5
      hitRefund: 1               // 적중 환급 +1 (Q1 확정 — 심화·커스텀 채점 확정 시)
    },
    analysis: {
      ttlMs: 86400000,           // 결과 수명 24h
      warnMs: 10800000,          // 곧 만료 경고 잔여 3h
      basicCount: 5,             // 기본 지표 수
      fullCount: 32,             // 심화·커스텀 지표 수(엔진 indicatorCount 와 동기)
      concurrent: 1,             // 동시 실행 1건
      reanalysisFreeTiers: ["deep", "custom"]  // 24h 내 재분석 무차감 — Q3: 심화·커스텀 대칭
    },
    xp: {
      levels: [40, 70, 110, 160],  // Lv2~5 임계. 기저 없음(Q2 — 프로토 +42는 데모 연출)
      levelBase: 0,
      firstVisit: 5,
      menuFirst: 3,                // 홈 제외 5개 탭 각각, 탭당 일 1회
      analysisFirst: 5,            // 심화/커스텀 각 일 1회
      signalView: 5,               // 오늘 시그널 첫 열람, 항목당 1회
      scoreView: 5,                // 오늘 채점건 첫 열람, 항목당 1회
      personaAnswer: 1,
      drawToggle: { xp: 1, perDay: 3 },
      stockAdd: { xp: 1, perDay: 3 }
    },
    limits: {
      stocksMax: 12,
      signal: { keepDays: 3, page: 20, more: 10 },
      score: { keepDays: 90, page: 20, more: 10 },
      persona: { perDay: 5, guestMax: 3 }
    },
    persona: {
      stages: [0, 4, 9, 16, 31, 61],
      stageNames: ["첫 스케치", "윤곽 잡는 중", "또렷해지는 중", "정밀", "초정밀", "현미경급"]
    },
    data: {
      liteBars: 60,                // 홈 시세·시그널 감지용 경량 요청(감지 룰 최대 창 20봉+ATR14+BB20). 분석은 전량 이력(PC 정합)
      fresh: { "1day": 300000, "1week": 1800000, "1month": 1800000 }   // 세션 신선도(ms) — 서버 max-age 와 동일
    },
    stats: {
      minN: 5,                     // 서버 al_peers_stats 와 동일 — 표본 미달 항목은 '집계 준비 중'
      // walk-forward 백테스트 정본 실측(forge-engine.html — 프로토 62.6%/60.96% 샘플 대체).
      // 방향은 '항상 상승' 기준선을 넘지 못한다는 것까지가 정직 표기의 일부다.
      backtest: { hit: 58.1, base: 60.8, n: "31,971", syms: 87 }
    },
    ui: {
      sheetClosePx: 90,
      skeletonMs: 180,
      toastMs: 1800,
      toastNegMs: 3200,
      rewardMs: 1500,
      swipePx: 40,
      haptics: {
        deduct: [30, 40, 30], done: [15, 30, 60], earn: [15, 35, 20],
        reward: [15, 40, 25, 60], rewardBig: [22, 45, 30, 55, 40, 80],
        warn: [60, 50, 60], stop: [25], tick: [12]
      }
    }
  };

  function scoopCap(level) {
    const lv = (typeof level === "number" && level >= 1) ? level : 1;
    return POLICY.scoop.capBase + (lv - 1) * POLICY.scoop.capPerLevel;
  }

  function levelOf(xp) {
    const v = (typeof xp === "number" ? xp : 0) + POLICY.xp.levelBase;
    const L = POLICY.xp.levels;
    let lv = 1;
    for (let i = 0; i < L.length; i++) if (v >= L[i]) lv = i + 2;
    return lv;
  }

  // 서버 리모트 컨피그 병합 — 아는 키만, 같은 타입만. 미지 키·타입 불일치는 조용히 무시
  // (서버 오설정이 클라를 깨지 않게 fail-safe).
  function mergeKnown(dst, src) {
    Object.keys(src).forEach(function (k) {
      if (!(k in dst)) return;
      const d = dst[k], s = src[k];
      if (Array.isArray(d)) { if (Array.isArray(s)) dst[k] = s.slice(); return; }
      if (d !== null && typeof d === "object") {
        if (s !== null && typeof s === "object" && !Array.isArray(s)) mergeKnown(d, s);
        return;
      }
      if (typeof d === typeof s) dst[k] = s;
    });
  }
  function applyRemote(obj) {
    if (obj && typeof obj === "object") mergeKnown(POLICY, obj);
  }

  return { POLICY: POLICY, scoopCap: scoopCap, levelOf: levelOf, applyRemote: applyRemote };
});
