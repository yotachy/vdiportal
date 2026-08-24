/* 머니스쿱 앱 — 페르소나 로직(집계·단계·레이더·성향 벡터·프리셋 추천·보정 가중).
   답변 = [{j(선택 인덱스), d(차원 0~4), l(강도 0~2)}] — 질문 은행은 서버(총량 비공개, Q4)이고
   답변에 차원·강도를 스냅샷해 두므로 은행 재조회 없이 모든 시각화가 선다.
   진척 표기는 % 금지(지침서 §9·퀴즈 11) — 정밀도 단계 + '단계 내' 진행률만.
   보정 기준선(Q14 — 협의 고정점, 리모트 컨피그 대상): 성향(보는 근거·매매 호흡·위험)을
   지표 그룹(t/m/v/q/s) 가중으로 매핑, 배율 ±15% 캡 — 작고 결정적이며 pfit 화면에 내역을
   정직하게 표기한다. 보정의 최종 공식은 엔진 몫으로 승격 예정(§15). UMD — node 테스트. */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else { root.MS = root.MS || {}; root.MS.persona = api; }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const DIMS = ["위험 성향", "매매 호흡", "보는 근거", "지표 깊이", "복기 성향"];
  const LVS = [
    ["신중 방어형", "중심 잡기형", "역발상 공격형"],
    ["단타 호흡", "스윙 호흡", "장기 호흡"],
    ["추세 우선", "거래량 우선", "캔들 우선"],
    ["지표 입문", "지표 중수", "지표 탐험가"],
    ["복기파", "반반파", "쿨다운파"]
  ];
  const RADAR_LABELS = ["손절", "물타기", "레버리지", "멘탈", "보유", "회전율", "진입", "추세",
    "거래량", "캔들", "지표 폭", "숙련", "실험", "복기", "기록", "재도전"];

  function heat(answers) {
    const h = [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]];
    (answers || []).forEach(function (a) {
      if (a && a.d >= 0 && a.d < 5 && a.l >= 0 && a.l < 3) h[a.d][a.l]++;
    });
    return h;
  }

  // 정밀도 단계 — stages 경계(config POLICY.persona.stages)·이름. % 아님: 단계 내 진행률만.
  function stageOf(n, stages, names) {
    let idx = 0;
    for (let i = 0; i < stages.length; i++) if (n >= stages[i]) idx = i;
    const lo = stages[idx];
    const hi = idx + 1 < stages.length ? stages[idx + 1] : null;
    const inPct = hi == null ? 100 : Math.max(6, Math.min(100, Math.round((n - lo) / (hi - lo) * 100)));
    return { idx: idx, name: names[idx], inPct: inPct, count: n, last: hi == null };
  }

  // 차원값 0..1 — (중강도 + 2×고강도) / (2×표본)
  function vector(answers) {
    const h = heat(answers);
    return h.map(function (row) {
      const tot = row[0] + row[1] + row[2];
      return tot ? (row[1] + row[2] * 2) / (tot * 2) : 0;
    });
  }

  // 우세 성향 칩 — 표본 있는 차원의 최빈 레벨 라벨
  function chips(answers) {
    const h = heat(answers);
    const out = [];
    h.forEach(function (row, d) {
      const tot = row[0] + row[1] + row[2];
      if (!tot) return;
      let bi = 0;
      if (row[1] > row[bi]) bi = 1;
      if (row[2] > row[bi]) bi = 2;
      out.push({ d: d, dim: DIMS[d], label: LVS[d][bi], n: tot });
    });
    return out;
  }

  // 16스포크 레이더 값(0..1) — 5축 보간 + 결정적 노이즈(프로토 pHmField 승계)
  function radarValues(answers) {
    const v = vector(answers);
    const tot = (answers || []).length;
    const out = [];
    for (let i = 0; i < 16; i++) {
      const f = i / 16 * 5;
      const a = Math.floor(f) % 5, b = (a + 1) % 5, t = f - Math.floor(f);
      let val = v[a] * (1 - t) + v[b] * t;
      const nz = (Math.sin(i * 91.7 + 7.3) * 43758.5453) % 1;
      val += (nz - 0.5) * 0.13 * Math.min(1, tot / 6);
      out.push(Math.max(0.06, Math.min(1, tot ? val : 0.06)));
    }
    return out;
  }

  // 골드 레이더 SVG(홈 카드·pfit 공용)
  function radarSvg(answers, size) {
    const S = size || 150, C = S / 2, R = C - 8;
    const vals = radarValues(answers);
    const pt = function (i, r) {
      const a = -Math.PI / 2 + i / 16 * Math.PI * 2;
      return (C + Math.cos(a) * r).toFixed(1) + "," + (C + Math.sin(a) * r).toFixed(1);
    };
    let grid = "";
    [0.33, 0.66, 1].forEach(function (g) {
      let p = "";
      for (let i = 0; i < 16; i++) p += (i ? " " : "") + pt(i, R * g);
      grid += '<polygon points="' + p + '" fill="none" stroke="var(--ln1)" stroke-width="0.7"/>';
    });
    let poly = "";
    for (let i = 0; i < 16; i++) poly += (i ? " " : "") + pt(i, R * vals[i]);
    return '<svg viewBox="0 0 ' + S + " " + S + '" width="' + S + '" height="' + S + '" style="display:block" aria-hidden="true">' +
      grid +
      '<polygon points="' + poly + '" fill="rgba(210,165,22,0.18)" stroke="var(--cu)" stroke-width="1.4" stroke-linejoin="round"/>' +
      "</svg>";
  }

  // ── 성향 → 지표 그룹 기여(Q14 기준선 — 보는 근거·매매 호흡·위험만 방향성 있음) ──
  const DIM_GROUP = [
    // 위험 성향: 방어=추세·구조 / 공격=모멘텀·변동성
    [{ t: 0.5, s: 0.5 }, { t: 0.2, m: 0.2, v: 0.2, q: 0.2, s: 0.2 }, { m: 0.6, v: 0.4 }],
    // 매매 호흡: 단타=모멘텀·변동성 / 스윙=구조·추세 / 장기=추세
    [{ m: 0.6, v: 0.4 }, { s: 0.5, t: 0.5 }, { t: 1 }],
    // 보는 근거: 추세 / 거래량 / 캔들(구조·모멘텀)
    [{ t: 1 }, { q: 1 }, { s: 0.6, m: 0.4 }]
  ];

  function groupAffinity(answers) {
    const g = { t: 0, m: 0, v: 0, q: 0, s: 0 };
    let n = 0;
    (answers || []).forEach(function (a) {
      if (!a || a.d > 2) return;   // 깊이·복기는 방향성 없음
      const contrib = DIM_GROUP[a.d] && DIM_GROUP[a.d][a.l];
      if (!contrib) return;
      Object.keys(contrib).forEach(function (k) { g[k] += contrib[k]; });
      n++;
    });
    return { g: g, n: n };
  }

  // 프리셋 추천 — 성향 그룹 벡터와 PROF(축 순서 t,m,q,v,s) 코사인 유사도 최대
  function suggestPreset(answers, presets) {
    const aff = groupAffinity(answers);
    if (!aff.n) return null;
    const a = [aff.g.t, aff.g.m, aff.g.q, aff.g.v, aff.g.s];
    let best = null, bestScore = -1;
    presets.forEach(function (p) {
      if (p.name === "전체 종합") return;   // 표준은 추천 1번 카드가 따로 있다
      const b = p.prof;
      let dot = 0, na = 0, nb = 0;
      for (let i = 0; i < 5; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
      const score = (na && nb) ? dot / Math.sqrt(na * nb) : 0;
      if (score > bestScore) { bestScore = score; best = p.name; }
    });
    return best;
  }

  // 페르소나 보정 그룹 배율(Q14 기준선) — 평균 대비 편차를 ±15% 캡으로
  function groupWeights(answers) {
    const aff = groupAffinity(answers);
    const out = { t: 1, m: 1, v: 1, q: 1, s: 1 };
    if (!aff.n) return out;
    const keys = ["t", "m", "v", "q", "s"];
    const avg = keys.reduce(function (s2, k) { return s2 + aff.g[k]; }, 0) / 5;
    keys.forEach(function (k) {
      const dev = aff.n ? (aff.g[k] - avg) / aff.n : 0;
      out[k] = Math.max(0.85, Math.min(1.15, 1 + dev * 0.5));
    });
    return out;
  }

  return { DIMS: DIMS, LVS: LVS, RADAR_LABELS: RADAR_LABELS,
    heat: heat, stageOf: stageOf, vector: vector, chips: chips,
    radarValues: radarValues, radarSvg: radarSvg,
    groupAffinity: groupAffinity, suggestPreset: suggestPreset, groupWeights: groupWeights };
});
