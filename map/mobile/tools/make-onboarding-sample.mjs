// 온보딩 1단계(콜드오픈)가 쓰는 번들 시계. 네트워크 없이 즉시 뜨게 하려고 파일로 굽는다.
// 결정론적이다 — 후보를 전수 탐색해 점수로 정렬하고 1등을 고르므로, 다시 돌려도 같은 파일이
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
//   7. 남은 후보를 점수(확신도 confluence.score + 실제 이동폭)로 정렬해 1등을 쓴다. 동점이면
//      종목명 → 시작 인덱스 순으로 타이브레이크(플랫폼 Object 키 순서에 기대지 않는다).
import { writeFileSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const FC = require("../../forge-core.js");
const G = require("../www/graph.js");
const RM = require("../www/report-model.js");
const IND = require("../www/indicators.js");
const READ = require("../www/readings.js");

const N = 240;            // 번들 봉 수 — onboarding.js 의 상수와 짝
const GUESS_CUT = 12;     // onboarding.js GUESS_CUT 과 반드시 같다(가려지는 봉 수)
const VISIBLE = N - GUESS_CUT;
const EARN_GUARD = 5;     // 가려지는 구간 앞뒤 여유 — 실적일이 이 안에 있으면 버린다
const STEP = 45;          // 슬라이딩 보폭 — 커버리지와 실행시간(수천 회 FC.run)의 절충
const TOOLS = ["ma", "bollinger", "volume"];   // onboarding.js 가 실제로 작도하는 3종과 동기

const raw = JSON.parse(readFileSync(new URL("../../backtest/earn-ohlc.json", import.meta.url)));
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
    if (toolRows.some(r => !r || READ.isRefusal(r.text))) continue;   // 힌트로 보여줄 도구가 말이 없으면 버린다

    const conf = (out.verdict.confluence && out.verdict.confluence.score) || 0;
    const moveSize = Math.abs(Math.log(after / before)) * 100;   // 실제 이동폭(%p 근사) — 결과가 뚜렷할수록 좋은 예제
    const score = conf + moveSize;
    candidates.push({ sym, start, score, conf, moveSize, regime, actualUp });
  }
}

candidates.sort((a, b) => b.score - a.score || a.sym.localeCompare(b.sym) || a.start - b.start);
const pick = candidates[0];
if (!pick) throw new Error("조건을 만족하는 구간을 찾지 못했다 — 선별 기준(§1~7)을 완화할 것");

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
  "| 후보", candidates.length, "건 중 1위 —", pick.regime, "· 확신", pick.conf.toFixed(0) + "%",
  "· 이동폭", pick.moveSize.toFixed(2) + "%p",
  "(디버그 전용 — 종목명은 배포 파일에 없다:", pick.sym, "@", win[VISIBLE - 1].t + ")");
