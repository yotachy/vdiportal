// 온보딩 1단계(콜드오픈)가 쓰는 번들 시계. 네트워크 없이 즉시 뜨게 하려고 파일로 굽는다.
// 결정론적이다 — 후보를 전수 탐색해 규칙으로 정렬하고 1등을 고르므로, 다시 돌려도 같은 파일이
// 나온다(입력 backtest/earn-ohlc.json 이 안 바뀌는 한).
//
// ── 2026-08-18 재설계: 사인파 합성 → 실제 시세에서 구간을 "고른다" ──────────────────────
// 예전(태스크 이전)엔 이 파일이 사인파 합성 곡선을 만들었다. 사용자 지적: "실제 차트의
// 움직임에 기반한 샘플이면 좋겠고 핵심 기술적 도구를 작도한 힌트를 주고 맞추게 하는 게
// 좋아. 결과는 왜 그렇게 작도해서 결과가 이렇게 되었는지를 보여주는 거야." 합성 곡선으로는
// "이 앱이 실제로 잘하는 예" 를 보여줄 수 없다 — 그래서 backtest/earn-ohlc.json(30종목 ·
// 최대 20여 년 실측 OHLCV)에서 엔진이 실제로 뚜렷하게 판정했고, 그 판정대로 실제로 움직인
// 구간을 찾아 그대로 번들한다.
//
// ── 2026-08-19 리뷰 수정: "가장 극적인 것" → "전형적인 크기인데 잘 맞은 것" ─────────────
// 리뷰 지적(재현 확인됨): 필터 통과 후보 581건은 전부 "엔진이 맞힌" 사례인데, 그중에서도
// 옛 랭킹(conf+moveSize)이 이동폭 상위 1%(99.0 퍼센타일)를 골랐다 — 상위 1% 사례를 첫인상
// 으로 쓰는 건 과장이고, "예측선 너무 정확=착시"(프로젝트 메모리)·3단 대조 카드 유리할 때만
// 노출(직전 라운드 폐기)과 같은 패턴이다. 컨트롤러 판정(B+C): "맞힌 사례"인 것은 유지하되
// (실패 사례로 가르치는 건 온보딩 뒤 단계·심화 리포트의 반대 의견이 할 일이다) "가장 극적인
// 것"은 버린다. 그래서 이제는 후보 풀에서 이동폭이 **중앙값 근방(p40~p60)** 인 것들 중
// confluence(확신도)가 가장 높은 것을 고른다 — "흔한 크기의 움직임인데 도구들이 잘
// 맞아떨어진 사례"가 되도록. test/onboarding-sample.test.mjs 가 "출하된 표본이 극단(상위
// 10%)이 아니다"를 이 파일이 내보내는 buildCandidates() 로 재계산해 회귀를 잡는다.
//
// 종목명은 가린다(아래에서 sym/name 을 출력 파일에 절대 쓰지 않는다) — 특정 종목의 과거
// 차트를 첫 화면에 그대로 두면 추천으로 읽힌다. 콘솔 로그에만 남긴다(재현·디버그용, 배포
// 파일엔 안 실린다).
//
// ── 선별 기준(다음에 다시 돌릴 사람을 위해 코드로 남긴다) ───────────────────────────────
//   1. 240봉 창을 30종목 전체에 슬라이딩(보폭 STEP)으로 훑는다.
//   2. 앞 228봉(= N − GUESS_CUT, onboarding.js 의 GUESS_CUT 과 반드시 같아야 한다)만 엔진에
//      보여준다 — 이게 "찍기 전에 보이는 것"이다. 뒤 12봉은 정답(가려지는 구간)이다.
//   3. 그 228봉으로 **basicGraph**(온보딩이 그리는 지표 3종 MA·볼린저·거래량을 포함하는
//      5지표 티어, 화면이 실제로 쓰는 것과 같은 그래프)를 돌려 verdict.regime 을 얻는다.
//      중립(neutral)은 버린다 — "뚜렷한 판정"이 조건이다.
//   4. 가려졌던 12봉 뒤의 실제 종가와 비교해 **판정 방향과 실제 방향이 일치하는 것만** 남긴다
//      — 콜드오픈은 "엔진이 맞힌 예"를 보여준다(엔진이 늘 맞는다고 주장하는 게 아니라, 이
//      화면 자체가 "이렇게 판정하고 이렇게 근거를 댄다"는 실력 예시이기 때문).
//   5. 작도할 3종(MA·볼린저·거래량)의 판독문이 전부 "못 읽었다" 거절문이 아니어야 한다 —
//      힌트로 보여줄 도구가 실제로 뭔가 말을 해야 한다.
//   6. 가려지는 구간(마지막 GUESS_CUT+EARN_GUARD 봉) 안에 실적 발표일이 끼면 버린다 — 실적
//      서프라이즈로 튄 구간을 고르면 "기술적 근거로 설명했는데 사실은 뉴스 때문"이라는 거짓
//      인과가 된다. 이 앱은 가격·거래량·시간만 본다(obRisk 문구 그대로) — 그 약속과 맞는
//      구간만 고른다.
//   7. 위 1~6을 통과한 후보 풀의 실제 이동폭(moveSize) 분포에서 **p40~p60(중앙값 근방)** 에
//      드는 것만 남긴다 — "극적인 예"를 배제하고 "흔한 크기의 움직임"으로 제한한다. 그 안에서
//      confluence(확신도)가 가장 높은 것을 고른다. 동점이면 중앙값에 더 가까운 것 →
//      종목명 → 시작 인덱스 순으로 타이브레이크(플랫폼 Object 키 순서에 기대지 않는다).
//      p40~p60 밴드가 비면(후보가 아주 적을 때) 밴드를 좌우로 넓혀 재시도한다 — 조용히
//      전체 풀로 물러서면 극단값이 다시 뽑힐 수 있어, 반드시 "중앙값 근방"이라는 원칙 안
//      에서만 넓힌다.
import { writeFileSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
const require = createRequire(import.meta.url);
const FC = require("../../forge-core.js");
const G = require("../www/graph.js");
const RM = require("../www/report-model.js");
const IND = require("../www/indicators.js");
const READ = require("../www/readings.js");

export const N = 240;            // 번들 봉 수 — onboarding.js 의 상수와 짝
export const GUESS_CUT = 12;     // onboarding.js GUESS_CUT 과 반드시 같다(가려지는 봉 수)
export const VISIBLE = N - GUESS_CUT;
export const EARN_GUARD = 5;     // 가려지는 구간 앞뒤 여유 — 실적일이 이 안에 있으면 버린다
export const STEP = 45;          // 슬라이딩 보폭 — 커버리지와 실행시간(수천 회 FC.run)의 절충
export const TOOLS = ["ma", "bollinger", "volume"];   // onboarding.js 가 실제로 작도하는 3종과 동기
export const TYPICAL_LO = 0.40, TYPICAL_HI = 0.60;    // "전형적인 크기" 밴드 — 중앙값(p50) 근방 ±10퍼센타일

const TF_KO = RM.tfKo("1day");   // "일봉" — trendProfileForTF 의 한국어 정규식이 이 문자열이어야 걸린다

function windowOk(win) {
  return win.every(c => isFinite(c.o) && isFinite(c.h) && isFinite(c.l) && isFinite(c.c) &&
    isFinite(c.v) && c.v > 0 && c.h >= Math.max(c.o, c.c) && c.l <= Math.min(c.o, c.c));
}

function earningsNear(earnings, win) {
  if (!earnings || !earnings.length) return false;
  const guardStart = win[VISIBLE - EARN_GUARD] && win[VISIBLE - EARN_GUARD].t;
  const guardEnd = win[N - 1].t;
  if (!guardStart) return false;
  return earnings.some(d => d >= guardStart && d <= guardEnd);
}

// 후보 풀을 통째로 계산해 돌려준다(부수효과 없음 — 파일에 안 쓴다). 생성기 본문과
// test/onboarding-sample.test.mjs 가 이 함수 하나를 공유한다 — 필터 로직이 두 벌로 갈리면
// "출하된 표본이 극단이 아니다" 시험이 생성기와 다른 규칙으로 재는 꼴이 된다.
export function buildCandidates(raw) {
  const candidates = [];
  for (const sym of Object.keys(raw).sort()) {
    const rec = raw[sym];
    const candles = rec && rec.candles;
    if (!Array.isArray(candles) || candles.length < N) continue;
    for (let start = 0; start + N <= candles.length; start += STEP) {
      const win = candles.slice(start, start + N);
      if (!windowOk(win)) continue;
      if (earningsNear(rec.earnings, win)) continue;

      const visible = win.slice(0, VISIBLE);
      const price = visible.map(c => c.c);
      const vol = visible.map(c => c.v);
      const graph = G.basicGraph(FC);
      G.setVolume(graph, vol);
      const input = { price, candle: visible, volume: vol };
      const opt = { timeframe: TF_KO };
      let out;
      try { out = FC.run(graph, input, opt); } catch (e) { continue; }
      const regime = out.verdict.regime;
      if (regime !== "bull" && regime !== "bear") continue;

      const before = price[price.length - 1];
      const after = win[N - 1].c;
      if (!isFinite(before) || !isFinite(after) || before <= 0) continue;
      const actualUp = after >= before;
      const predUp = regime === "bull";
      if (actualUp !== predUp) continue;   // 판정과 실제가 어긋나면 콜드오픈 예제로 안 쓴다

      const ctx = IND.ctxFrom(input);
      const rows = IND.readings(FC, graph, input, ctx);
      const toolRows = TOOLS.map(t => rows.find(r => r.type === t));
      if (toolRows.some(r => !r || READ.isRefusal(r.text))) continue;   // 힌트 도구가 말이 없으면 버린다

      const conf = (out.verdict.confluence && out.verdict.confluence.score) || 0;
      const moveSize = Math.abs(Math.log(after / before)) * 100;   // 실제 이동폭(%p 근사)
      candidates.push({ sym, start, conf, moveSize, regime, actualUp });
    }
  }
  return candidates;
}

// 이동폭 분포에서 백분위를 재는 두 헬퍼. sorted 는 오름차순 moveSize 배열이어야 한다.
export function quantile(sorted, q) {
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))));
  return sorted[idx];
}
export function percentileRank(sorted, v) {
  let lo = 0, hi = sorted.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (sorted[mid] <= v) lo = mid + 1; else hi = mid; }
  return (lo / sorted.length) * 100;
}

// p40~p60 밴드로 "전형적인 크기"만 남기고, 그 안에서 confluence 최댓값을 고른다. 밴드가 비면
// (후보가 아주 적을 때) 좌우로 넓혀 재시도한다 — "중앙값 근방"이라는 원칙 자체는 유지한다.
export function pickTypical(candidates) {
  if (!candidates.length) return null;
  const moveSizesSorted = candidates.map(c => c.moveSize).sort((a, b) => a - b);
  const median = quantile(moveSizesSorted, 0.5);
  let lo = TYPICAL_LO, hi = TYPICAL_HI, typical = [];
  while (!typical.length && lo >= 0 && hi <= 1) {
    const loV = quantile(moveSizesSorted, lo), hiV = quantile(moveSizesSorted, hi);
    typical = candidates.filter(c => c.moveSize >= loV && c.moveSize <= hiV);
    if (!typical.length) { lo -= 0.1; hi += 0.1; }
  }
  if (!typical.length) typical = candidates;   // 이론상 도달 불가 — 방어적 폴백
  typical.sort((a, b) =>
    b.conf - a.conf ||
    Math.abs(a.moveSize - median) - Math.abs(b.moveSize - median) ||
    a.sym.localeCompare(b.sym) ||
    a.start - b.start);
  return { pick: typical[0], typical, median, moveSizesSorted };
}

function main() {
  const raw = JSON.parse(readFileSync(new URL("../../backtest/earn-ohlc.json", import.meta.url)));
  const candidates = buildCandidates(raw);
  if (!candidates.length) throw new Error("조건을 만족하는 구간을 찾지 못했다 — 선별 기준(§1~6)을 완화할 것");

  const { pick, typical, median, moveSizesSorted } = pickTypical(candidates);
  const pickPct = percentileRank(moveSizesSorted, pick.moveSize);

  const win = raw[pick.sym].candles.slice(pick.start, pick.start + N);
  const out = { price: [], candle: [], asOf: "" };
  win.forEach(c => {
    out.candle.push({ o: +c.o.toFixed(4), h: +c.h.toFixed(4), l: +c.l.toFixed(4), c: +c.c.toFixed(4),
                      v: Math.round(c.v), t: c.t });
    out.price.push(+c.c.toFixed(4));
  });
  out.asOf = out.candle[N - 1].t;

  // UMD 로 굽는다 — 이 저장소가 www/ 전체에서 쓰는 방식이고(forge-core·readings·indicators),
  // fetch 가 아니라 <script src> 로 들어오므로 1단계에 비동기 대기가 없다. 파일이 빠지면
  // 브라우저에서 즉시 죽지, 빈 차트로 조용히 넘어가지 않는다.
  const body = "// 생성물이다. 손으로 고치지 말 것 — tools/make-onboarding-sample.mjs 를 다시 돌린다.\n"
    + "(function (root, f) {\n"
    + '  if (typeof module === "object" && module.exports) module.exports = f();\n'
    + '  else MSGlobals.define("MSOnboardingSample", f());\n'
    + '}(typeof self !== "undefined" ? self : this, function () {\n'
    + "  return " + JSON.stringify(out) + ";\n"
    + "}));\n";
  writeFileSync(new URL("../www/onboarding-sample.js", import.meta.url), body);
  console.log("wrote onboarding-sample.js —", N, "bars,", out.candle[0].t, "→", out.asOf,
    "| 후보", candidates.length, "건(전형 밴드", typical.length, "건) 중 1위 —", pick.regime,
    "· 확신", pick.conf.toFixed(0) + "%",
    "· 이동폭", pick.moveSize.toFixed(2) + "%p (풀 " + pickPct.toFixed(1) + "퍼센타일, 중앙값 " + median.toFixed(2) + "%p)",
    "(디버그 전용 — 종목명은 배포 파일에 없다:", pick.sym, "@", win[VISIBLE - 1].t + ")");
}

// CLI 로 직접 실행됐을 때만 굽는다 — test/onboarding-sample.test.mjs 가 buildCandidates() 등을
// import 할 때 파일을 매번 다시 쓰면 시험에 부수효과가 생긴다(느려지고, "시험 실행이 곧
// 재생성"이라는 뜻밖의 결합이 생긴다).
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) main();
