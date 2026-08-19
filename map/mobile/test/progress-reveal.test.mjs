// P2 §7 — 해제 직후 전환 장면(시안 8b).
//
// 이 화면의 계약은 **타이밍**이다. 그리고 그 규칙은 19a(분석 진행 중계)와 **정반대**라,
// 두 화면을 한 컴포넌트로 묶는 순간 한쪽 규칙이 조용히 다른 쪽에 샌다(인벤토리 §0 충돌 8).
//   19a — 캐시로 0.3초에 끝나면 0.3초에 끝낸다(늘리지 않는다)
//   8b  — 서버가 더 빨라도 끝까지 재생한다(줄이지 않는다)
import { test } from "node:test";
import assert from "node:assert";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const R = require("../www/progress-reveal.js");
const G = require("../www/graph.js");
const FC = require("../../forge-core.js");
const S = require("../www/strings.js");
// Task 7 리뷰(라운드 1) — 8b 의 세 통이 실제로 32지표 판독에서 나오는지 재려면 report.js 가
// 부르는 것과 같은 세 모듈(지표 판독·집계·판정)을 실행해야 한다. 값을 지어내지 않는다.
const IND = require("../www/indicators.js");
const AV = require("../www/progress-analyze.js");
const RM = require("../www/report-model.js");

const SRC = readFileSync(new URL("../www/progress-reveal.js", import.meta.url), "utf8");
const REPORT = readFileSync(new URL("../www/screens/report.js", import.meta.url), "utf8");

test("최소 재생 시간이 있다 — 계산이 더 빨라도 줄이지 않는다", () => {
  assert.strictEqual(R.MIN_MS, 3000, "시안 8b 의 3초가 아니다");
  const mid = R.stateAt(1500, 32, 5);
  assert.strictEqual(mid.done, false, "절반 시점에 이미 끝났다고 답한다");
  assert.ok(mid.lit > 5 && mid.lit < 32, "중간 상태가 양 끝에 붙어 있다: " + mid.lit);
});

test("끝나면 전부 켜져 있다 — 덜 켜진 채 결과로 넘어가지 않는다", () => {
  const end = R.stateAt(R.MIN_MS, 32, 5);
  assert.strictEqual(end.done, true);
  assert.strictEqual(end.lit, 32);
  const over = R.stateAt(R.MIN_MS * 3, 32, 5);
  assert.strictEqual(over.lit, 32, "시간이 지나도 칸 수를 넘어선다");
});

test("시작 시점에는 기본 티어가 읽던 만큼만 켜져 있다", () => {
  const s0 = R.stateAt(0, 32, 5);
  assert.strictEqual(s0.lit, 5, "처음부터 전부 켜져 있으면 '무엇이 열렸는지'가 안 보인다");
  assert.strictEqual(R.stateAt(-100, 32, 5).lit, 5, "음수 시각(시계 어긋남)이 그대로 샌다");
});

// 19a 와 8b 는 다른 파일이어야 한다. 지금 19a 는 아직 없다 — 생겼을 때 이 단정이
// "한 파일에 넣지 말라"를 대신 말한다.
test("타이밍 정책을 19a 와 공유하지 않는다 — 파일이 다르고, 서로를 참조하지 않는다", () => {
  assert.ok(SRC.indexOf("MSProgressLive") < 0, "8b 가 19a 모듈을 참조한다");
  assert.ok(!/mode\s*[=:]\s*["'](live|reveal)["']/.test(SRC),
    "한 모듈에 mode 플래그로 두 규칙을 담고 있다 — 규칙이 서로 샌다");
  const live = new URL("../www/progress-live.js", import.meta.url);
  if (existsSync(live)) {
    const LIVE = readFileSync(live, "utf8");
    assert.ok(LIVE.indexOf("MSReveal") < 0, "19a 가 8b 를 참조한다 — 타이밍이 섞인다");
    assert.ok(LIVE.indexOf("MIN_MS") < 0, "19a 에 최소 재생 시간이 있다 — 진행 중계를 일부러 늘린다");
  }
});

// 숫자를 지어내지 않는다. 빗 칸 수는 엔진에서, 스틸 칸은 기본 티어에서 온다.
//
// Task 7 리뷰(라운드 1) — 예전엔 total 을 ForgeCore.indicatorCount(32) 로 못박았다. 심화
// (full)에선 그래프가 실제로 32종이라 우연히 맞았지만, 전문(custom)은 MSGraph.customGraph()
// 가 그래프를 사용자가 고른 부분집합으로 줄인다 — 32 를 그대로 쓰면 다시 5≠32 류 불일치가
// 재발한다(실측: trend 프리셋 buckets 합 10 vs total 32). 지금은 MSGraph.indicatorTypes
// (an.graph) — "이 그래프에 실제로 있는 지표 종수" — 로 두 티어를 같은 계산 하나로 잰다.
test("칸 수는 엔진과 기본 티어에서 유도된다 — 리터럴 32 를 화면이 다시 적지 않는다", () => {
  assert.match(REPORT, /total: revealTotal, basic: MSGraph\.BASIC\.length/,
    "빗 칸 수를 리터럴이나 다른 변수로 넘긴다");
  assert.match(REPORT, /var revealTotal = graphTypes\.length \|\| ForgeCore\.indicatorCount;/,
    "revealTotal 이 그래프에서 유도되지 않는다");
  assert.ok(!/\b32\b/.test(S.t.rvOpened + S.t.rvCaption), "문구에 32 가 박혀 있다");
  assert.strictEqual(FC.indicatorCount - G.BASIC.length, 27,
    "오늘의 '열리는 개수'가 27 이 아니다 — 화면은 유도값을 쓰므로 자동으로 맞지만 시안 대조가 필요하다");
  // 심화(full)에서는 위 유도식이 여전히 정확히 32 를 낸다는 것을 진짜 계산으로 확인한다 —
  // strings.test.mjs 의 "지표 표시명은 엔진의 32종을 전부 덮는다" 가 이미 검증해 둔 동치
  // (indicatorTypes(full32Graph).length === indicatorCount)를 여기서도 재확인한다.
  assert.strictEqual(G.indicatorTypes(G.full32Graph(FC)).length, FC.indicatorCount,
    "full32Graph 의 실제 지표 종수가 ForgeCore.indicatorCount 와 다르다 — full 티어 total 유도가 32 를 안 낸다");
});

test("연출을 위해 엔진을 다시 돌리지 않는다 — 기다리는 시간은 사용자 것이다", () => {
  // 이 단언은 progress-reveal.js **자신**이 엔진을 부르지 않는다는 것만 잰다(report.js 가
  // 32지표를 실제로 읽는 것과는 다른 층 — 8b 는 여전히 값을 그대로 실어 나르는 순수 렌더러
  // 여야 한다). 주석은 뺀다 — 이 모듈의 주석이 "analyzeX 를 32번 더 돌리지 않는다"고
  // **설명**하고 있어서, 그대로 세면 근거를 적을수록 빨개진다.
  const code = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'\\])\/\/[^\n]*/gm, (m, p) => p);
  ["MSIndicators.readings", "analyzeX", "ForgeCore.run"].forEach(bad =>
    assert.ok(code.indexOf(bad) < 0, "연출 모듈이 " + bad + " 를 부른다"));
});

// ── Task 7 리뷰(라운드 1, Critical) — 세 통의 분모가 comb(5행)이 아니라 빗칸 전체(32)인지 ──
//
// 리뷰 실측: revealThenDraw() 가 MSLegend.tally(MSLegend.rows(...))(항상 5행, chart-legend.js
// 36-84행)를 8b 의 분모로 썼다. 그래서 세 통의 합은 언제나 5인데 헤드라인은 별도로 받은
// ForgeCore.indicatorCount(32) 로 "27개가 열렸습니다"를 말했다 — 한 화면에서 절대 못 맞는
// 구조였다(실측: {agree:3,dissent:2,noDir:0}=5 vs 27). buildVerdict() 가 같은 호출을 쓰는 건
// 맞지만 그건 "도구 5개 중 4개"라는 의도적으로 5-스코프인 문장을 위해서다(그 함수 자체
// 주석) — 같은 패턴, 다른 스코프였다.
//
// revealThenDraw() 의 함수 본문만 오려 검사한다 — REPORT 전체에서 "MSLegend" 를 찾으면
// buildVerdict()·buildComb() 의 정당한(5-스코프) 사용까지 걸린다. 이 함수는 순수 문자열
// 추출로 검증한다는 한계가 있어(아래 "출처의 실제 계산"은 진짜 엔진으로 별도 검증한다),
// 되돌리기 변이가 실제로 이 검사를 빨개지게 하는지도 함께 증명한다.
function revealThenDrawBody(reportSrc) {
  const s = reportSrc.indexOf("function revealThenDraw() {");
  const e = reportSrc.indexOf("\n          if (stepper && stepper.total) {", s);
  if (s < 0 || e < 0) return null;
  return reportSrc.slice(s, e);
}
// 주석(설명문 자체가 "MSLegend" 를 언급한다 — 이 함수 위 리뷰 경위 주석)을 먼저 걷어낸다.
// 안 그러면 "MSLegend 를 쓰지 않는다"는 검사가 주석 속 단어에 걸려 자기 자신을 오탐한다.
function stripComments(code) {
  return code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'\\])\/\/[^\n]*/gm, (m, p) => p);
}
function usesFullIndicatorSource(body) {
  if (!body) return false;
  const code = stripComments(body);
  // narratedRows(=readings() 가 이미 만든 32지표 판독, "지표 계산은 한 지점" 규칙 —
  // readings.test.mjs — 때문에 여기서 readings() 를 다시 부르지 않는다) + noDirRows +
  // tallyOf 세 재료로 세 통을 만들어야 한다. MSLegend(comb 의 5행)는 쓰지 않는다.
  return /narratedRows/.test(code) &&
    /MSIndicators\.noDirRows\(/.test(code) &&
    /MSAnalyzeView\.tallyOf\(/.test(code) &&
    code.indexOf("MSLegend") < 0;
}

test("8b 배선 — revealThenDraw() 는 comb(5행)이 아니라 32지표 판독을 쓴다", () => {
  const body = revealThenDrawBody(REPORT);
  assert.ok(body, "revealThenDraw() 함수 본문을 못 찾았다 — report.js 구조가 바뀌었다");
  assert.ok(usesFullIndicatorSource(body),
    "revealThenDraw() 가 32지표 판독(narratedRows/noDirRows/tallyOf)이 아니라 다른 출처(MSLegend 등)를 쓴다");
  assert.ok(REPORT.indexOf("conf ? conf.agree : null") < 0,
    "옛 배선(엔진 confluence.agree 하나만)이 아직 남아 있다");
});

test("변이 증명 — revealThenDraw() 가 MSLegend(5-스코프)로 되돌아가면 위 검사가 빨개진다", () => {
  const real = revealThenDrawBody(REPORT);
  // Task 7 라운드 1 리뷰 전 실제 코드를 그대로 재현한 변이 표본 — 지어낸 반례가 아니라
  // 이번에 반려된 그 코드 자체다.
  const mutated = "function revealThenDraw() {\n" +
    "  var tally = MSLegend.tally(MSLegend.rows(an, an.out.prediction, null));\n" +
    "  var vm = MSReportModel.verdict({ dir: an.out.verdict.regime, up: tally.up, down: tally.down, flat: tally.flat });\n";
  assert.notStrictEqual(mutated, real, "변이 표본이 실제 소스와 우연히 같다 — 변이가 공허하다");
  assert.strictEqual(usesFullIndicatorSource(real), true, "정상 소스인데도 위 술어가 통과를 못 시킨다");
  assert.strictEqual(usesFullIndicatorSource(mutated), false,
    "MSLegend 로 되돌린 표본인데도 위 술어가 여전히 통과시킨다 — 이 검사는 실제로는 아무것도 못 잡는다");
});

// ── 출처의 실제 계산 — 지어낸 값이 아니라 진짜 엔진(ForgeCore)·진짜 32지표 그래프로 잰다.
// 값을 손으로 넣은 이전 라운드의 시험(revealState({agree:18,...}))은 revealState() 가
// 받은 값을 그대로 돌려준다는 것만 증명했지, report.js 가 그 18·6·8 을 어떻게 만드는지는
// 아무것도 안 쟀다 — 리뷰가 지적한 정확히 그 함정이다. 여기서는 report.js 의
// revealThenDraw() 와 **같은 호출 순서**(readings → noDirRows → tallyOf → verdict)를
// 같은 인자 모양으로 실행해, 나온 세 통의 합이 ForgeCore.indicatorCount 와 맞는지를
// 진짜 계산 결과로 확인한다.
function realThreeBuckets(dir) {
  // gate-routes.mjs 의 candles(driftMul=0.12) 와 같은 수식(사인함수, 난수 없음) — 브라우저
  // 관문이 실제로 태우는 표본과 같은 모양을 쓴다(다른 수식이면 "node 에서만 되는 값"이 된다).
  const n = 360;
  const price = Array.from({ length: n }, (_, i) => 200 + i * 0.12 + Math.sin(i / 11) * 6 + Math.sin(i / 37) * 14);
  const candle = price.map((c, i) => ({ t: "2026-01-01", o: c - 1, h: c + 1.8, l: c - 1.6, c, v: 1000000 + (i % 23) * 40000 }));
  const data = { price, candle, volume: candle.map(c => c.v) };
  const graph = G.full32Graph(FC);
  const ctx = IND.ctxFrom(data);
  const rows32 = IND.readings(FC, graph, data, ctx);
  const noDir32 = IND.noDirRows(FC, data, ctx);
  const tally = AV.tallyOf(rows32, IND.EPS);
  const vm = RM.verdict({ dir: dir, up: tally.up, down: tally.down, flat: tally.flat + noDir32.length });
  return { vm, rows32, noDir32 };
}

test("출처의 실제 계산 — 32지표 판독의 합이 ForgeCore.indicatorCount 와 같다(bull)", () => {
  const { vm, rows32, noDir32 } = realThreeBuckets("bull");
  // 전제 확인 — 이 표본(360봉)이 실제로 30종 전부를 읽어냈는지(못 읽은 지표가 있으면 이
  // 시험 자체가 "표본이 모자라다"는 다른 문제가 된다, 지어낸 전제가 아니라 실측이어야 함).
  assert.strictEqual(rows32.length + noDir32.length, FC.indicatorCount,
    "표본이 32종을 다 못 읽었다(rows32=" + rows32.length + ", noDir32=" + noDir32.length + ") — 시험 표본을 늘려야 한다");
  assert.strictEqual(vm.agree + vm.dissent + vm.noDir, FC.indicatorCount,
    "세 통의 합이 ForgeCore.indicatorCount 와 다르다: " + JSON.stringify(vm));
});

test("출처의 실제 계산 — 중립(무방향) 판정에서도 세 통의 합이 유지된다", () => {
  // verdict() 의 중립 분기는 up+down+noDir 전부를 noDir 로 몰아준다(report-model.js) —
  // 방향 자체가 없으니 동의도 반대도 정의되지 않는다. 그래도 합은 깨지면 안 된다.
  const { vm } = realThreeBuckets("neutral");
  assert.strictEqual(vm.agree, 0, "중립인데 동의가 있다");
  assert.strictEqual(vm.dissent, 0, "중립인데 반대가 있다");
  assert.strictEqual(vm.agree + vm.dissent + vm.noDir, FC.indicatorCount,
    "중립 판정에서 세 통의 합이 ForgeCore.indicatorCount 와 다르다: " + JSON.stringify(vm));
});

// ── Task 7 리뷰(라운드 1) — 브라우저 관문(report-purchase-custom)이 실측으로 잡은 두 번째
// 문제: 전문(custom) 티어는 MSGraph.customGraph() 가 그래프를 사용자가 고른 부분집합으로
// 줄인다("trend" 프리셋 = 핵심 5종 + ma·trend·ichimoku·supertrend·adx, ma 는 core 와 겹침
// → 실제 9종). total 을 ForgeCore.indicatorCount(32) 로 고정하면 buckets 합(9~10, phasefold
// 는 프리셋 밖이라 noDirRows() 가 돌려주는 phantom 행까지 걸러야 한다)과 절대 못 맞는다 —
// 실측: 필터링 전 buckets=[7,1,2]=10 vs total=32(브라우저 관문에서 실패로 잡힘). 이 시험은
// report.js 의 실제 수정(graphTypes 로 total 을 유도 + noDir32 를 그래프 소속으로 거름)과
// 같은 계산을 진짜 customGraph·진짜 weights 로 실행해 검산한다.
function realThreeBucketsCustom(presetKey, dir) {
  const IT = require("../www/ind-tiers.js");
  const n = 360;
  const price = Array.from({ length: n }, (_, i) => 200 + i * 0.12 + Math.sin(i / 11) * 6 + Math.sin(i / 37) * 14);
  const candle = price.map((c, i) => ({ t: "2026-01-01", o: c - 1, h: c + 1.8, l: c - 1.6, c, v: 1000000 + (i % 23) * 40000 }));
  const data = { price, candle, volume: candle.map(c => c.v) };
  const weights = IT.weightsOf(presetKey, []);
  const graph = G.customGraph(FC, weights);
  const graphTypes = G.indicatorTypes(graph);
  const ctx = IND.ctxFrom(data);
  const rows = IND.readings(FC, graph, data, ctx);
  const noDir = IND.noDirRows(FC, data, ctx).filter(r => graphTypes.indexOf(r.type) >= 0);
  const tally = AV.tallyOf(rows, IND.EPS);
  const vm = RM.verdict({ dir, up: tally.up, down: tally.down, flat: tally.flat + noDir.length });
  return { vm, graphTypes, rows, noDir };
}

test("출처의 실제 계산(전문/custom) — 세 통의 합은 32 가 아니라 이 그래프의 실제 지표 수와 같다", () => {
  const { vm, graphTypes, rows, noDir } = realThreeBucketsCustom("trend", "bull");
  assert.ok(graphTypes.length < FC.indicatorCount,
    "이 전제(프리셋이 32종 전부를 고르지 않는다)가 깨졌다 — 시험 표본을 다시 골라야 한다: " + graphTypes.length);
  assert.strictEqual(rows.length + noDir.length, graphTypes.length,
    "지표 계산(rows+noDir)의 합이 그래프의 실제 지표 수와 다르다 — 그래프에 없는 지표를 세거나(noDir 필터 실패) 있는 지표를 놓쳤다");
  assert.strictEqual(vm.agree + vm.dissent + vm.noDir, graphTypes.length,
    "전문 티어에서 세 통의 합이 그 그래프의 실제 지표 수와 다르다: " + JSON.stringify(vm) + " vs " + graphTypes.length);
});

test("변이 증명(전문/custom) — noDir 를 그래프 소속으로 거르지 않으면 위 검사가 빨개진다", () => {
  const IT = require("../www/ind-tiers.js");
  const n = 360;
  const price = Array.from({ length: n }, (_, i) => 200 + i * 0.12 + Math.sin(i / 11) * 6 + Math.sin(i / 37) * 14);
  const candle = price.map((c, i) => ({ t: "2026-01-01", o: c - 1, h: c + 1.8, l: c - 1.6, c, v: 1000000 + (i % 23) * 40000 }));
  const data = { price, candle, volume: candle.map(c => c.v) };
  const weights = IT.weightsOf("trend", []);
  const graph = G.customGraph(FC, weights);
  const graphTypes = G.indicatorTypes(graph);
  const ctx = IND.ctxFrom(data);
  const rows = IND.readings(FC, graph, data, ctx);
  // 변이 — 거르지 않은 채(수정 전 코드) 그대로 쓴다.
  const noDirUnfiltered = IND.noDirRows(FC, data, ctx);
  assert.ok(noDirUnfiltered.length > noDirUnfiltered.filter(r => graphTypes.indexOf(r.type) >= 0).length,
    "이 프리셋이 우연히 trend·phasefold 를 전부 골라 변이가 공허하다 — 다른 프리셋으로 바꿔야 한다");
  const tally = AV.tallyOf(rows, IND.EPS);
  const vmMutated = RM.verdict({ dir: "bull", up: tally.up, down: tally.down, flat: tally.flat + noDirUnfiltered.length });
  assert.notStrictEqual(vmMutated.agree + vmMutated.dissent + vmMutated.noDir, graphTypes.length,
    "거르지 않은 변이인데도 합이 우연히 맞는다 — 이 변이로는 회귀를 못 잡는다");
});

test("탭하면 즉시 끝난다 — 연출에 사용자를 앉혀두지 않는다", () => {
  assert.match(SRC, /scrim\.addEventListener\("click", finish\)/, "탭 스킵이 없다");
  assert.match(SRC, /if \(finished\) return;/, "두 번 끝나면 onDone 이 두 번 불린다");
  assert.ok(S.t.rvSkip && S.t.rvSkip.indexOf("탭") >= 0, "탭하면 넘어간다는 안내가 없다");
});

test("성공 직후에만 재생된다 — 실패·환급 경로는 연출로 가지 않는다", () => {
  const at = REPORT.indexOf("MSReveal.play");
  const success = REPORT.indexOf('if (r.kind === "success")');
  const refunded = REPORT.indexOf('r.kind === "refunded"');
  assert.ok(success > 0 && at > success && at < refunded,
    "연출 호출이 성공 분기 안에 있지 않다");
});

// ── P1b Task 7 — 세 통(동의·반대·무판정). 브리프가 준 시험 원문을 그대로 쓴다. ──────────

// 가벼운 DOM 스텁 — MSUi.el() 이 실제로 건드리는 것만 지원한다(createElement/appendChild/
// className/textContent/style/querySelector). progress-analyze.test.mjs 의 I4 시험이 쓰는
// MiniEl 과 같은 태도지만, 여기서는 querySelector 에 클래스 다중 조합("a.b")·콤마 그룹
// ("a, b")까지 필요해서(브리프 시험 원문이 그렇게 쓴다) report-full.test.mjs 의 FakeNode 를
// 참고해 그 두 가지를 추가로 지원한다.
function FakeNode(tag) {
  this.tagName = String(tag || "div");
  this.className = "";
  this.children = [];
  this.parentNode = null;
  this._text = "";
  this.style = {};
}
Object.defineProperty(FakeNode.prototype, "textContent", {
  get() { return this.children.length ? this.children.map(c => c.textContent).join("") : this._text; },
  set(v) { this._text = (v == null) ? "" : String(v); this.children = []; }
});
FakeNode.prototype.appendChild = function (c) { c.parentNode = this; this.children.push(c); return c; };
FakeNode.prototype.removeChild = function (c) {
  const i = this.children.indexOf(c);
  if (i >= 0) this.children.splice(i, 1);
  c.parentNode = null;
  return c;
};
FakeNode.prototype.addEventListener = function () {};
FakeNode.prototype._hasClass = function (cls) { return (" " + this.className + " ").indexOf(" " + cls + " ") >= 0; };
// "a.b" (한 요소가 두 클래스 다 가짐) · "a, b"(둘 중 하나) 를 함께 지원한다 — 진짜 CSS 엔진이
// 아니라 이 저장소 시험들이 실제로 쓰는 두 형태만 다룬다.
FakeNode.prototype._matches = function (sel) {
  return String(sel).split(",").some(group =>
    group.trim().split(".").filter(Boolean).every(c => this._hasClass(c)));
};
FakeNode.prototype._findAll = function (pred, out) {
  out = out || [];
  this.children.forEach(c => { if (pred(c)) out.push(c); c._findAll(pred, out); });
  return out;
};
FakeNode.prototype.querySelector = function (sel) { return this._findAll(n => n._matches(sel))[0] || null; };
FakeNode.prototype.querySelectorAll = function (sel) { return this._findAll(n => n._matches(sel)); };

function deepText(node) { return node ? node.textContent : ""; }

// play() 를 실제로 불러 나온 DOM 을 돌려준다. 세 통은 play() 안에서 **동기로**(rAF 를 기다리지
// 않고) 만들어지므로(revealState() 가 곧바로 계산해 buildBuckets 에 실린다), requestAnimationFrame
// 을 아예 안 불러도 값이 이미 DOM 에 있다 — 애니메이션 진행분(rv-count 의 lit/total)만 아직
// 비어 있을 뿐이고, 그건 이 시험의 관심사가 아니다.
function renderReveal(opts) {
  const MSUi = require("../www/ui.js");
  const MSStr = require("../www/strings.js");
  const bodyEl = new FakeNode("body");
  const g = globalThis;
  const saved = {};
  const put = (k, v) => { saved[k] = Object.prototype.hasOwnProperty.call(g, k) ? g[k] : undefined; g[k] = v; };
  put("document", {
    createElement: t => new FakeNode(t), body: bodyEl,
    querySelector: sel => bodyEl.querySelector(sel)
  });
  put("MSUi", MSUi);
  put("MSStr", MSStr);
  put("requestAnimationFrame", () => 1);   // 절대 안 불린다 — 세 통은 애니메이션과 무관하게 이미 그려져 있다
  put("cancelAnimationFrame", () => {});
  try {
    R.play(opts);
    return bodyEl.querySelector(".rv-scrim") || bodyEl;
  } finally {
    Object.keys(saved).forEach(k => { if (saved[k] === undefined) delete g[k]; else g[k] = saved[k]; });
  }
}

test("8b — 동의·반대·무판정 세 통의 합이 카운터와 같다", () => {
  const dom = renderReveal({ agree: 18, dissent: 6, noDir: 8, total: 32 });
  const txt = deepText(dom.querySelector(".rv-count, .rv-buckets"));
  assert.match(txt, /18/, "동의 수가 없다");
  assert.match(txt, /6/, "반대 수가 없다");
  assert.match(txt, /8/, "무판정 수가 없다");
});

test("8b — 세 통의 합이 카운터와 어긋나면 드러난다", () => {
  // revealState() 가 verdict() 처럼 값을 그대로 실어 나른다는 계약을 잰다 — 8b 가 그 함수를
  // 안 쓰고 딴 값을 받으면(예: 엔진 confluence.agree 하나만) 이 합이 깨진다.
  const st = R.revealState({ agree: 18, dissent: 6, noDir: 8, total: 32 });
  assert.strictEqual(st.agree + st.dissent + st.noDir, st.total,
    "세 통의 합이 카운터와 다르다");
});
