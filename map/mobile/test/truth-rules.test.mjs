// P2 §2 — 진실 규칙. 이 페이즈의 산물은 화면이 아니라 **화면이 할 수 있는 말의 경계**다.
//
// 왜 화면보다 먼저 서는가: 시안 파일에 "예상 적중률 64%"·"58%"·"2%p 만 오릅니다"가 그대로
// 남아 있다. 티어 실측이 P1 Task 3 시점에 처음 나왔고 시안은 그 전에 그려졌으니 디자이너
// 잘못이 아니다 — 그러나 화면을 먼저 그리면 다음 사람이 그 숫자를 그대로 옮긴다.
//
// 실측(backtest/tier-report.json · 엔진 1.11.0 · 87종 · 각 31,971건):
//   방향 적중 기본 58.18% · 심화 58.54% (차이 +0.36%p)
//   확률 오차(ECE) 1.05%p → 0.27%p (4배 정직) · 콘 커버 73.8% → 77.1%
//   "항상 오른다" 61.0% — **두 티어 모두 그 아래다.**
// 즉 심화가 파는 것은 "더 맞힌다"가 아니라 "더 정직하게 말한다"이다.
import { test } from "node:test";
import assert from "node:assert";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const S = require("../www/strings.js");

const WWW = fileURLToPath(new URL("../www/", import.meta.url));

// vendor/ 는 sync-engine 이 만드는 생성물이라 제외한다(커밋되지 않고 로컬 sync 여부에 따라
// 존재가 갈려 관문이 불안정해진다 — map/CLAUDE.md 의 vendor 규율).
function collectJs(dir) {
  const out = [];
  readdirSync(dir).forEach(name => {
    if (name === "vendor") return;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push.apply(out, collectJs(full));
    else if (name.endsWith(".js")) out.push(full);
  });
  return out;
}
const FILES = collectJs(WWW).map(f => ({ label: f.replace(WWW, "www/"), src: readFileSync(f, "utf8") }));

// 소스의 문자열 리터럴을 (줄번호, 내용)으로 뽑는다. 주석은 먼저 비운다 — 이 파일들의 주석은
// 설계 근거를 길게 적는 관례라 "적중률 58%" 같은 서술이 흔하고, 그건 화면에 안 나간다.
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ""))
            .replace(/(^|[^:"'\\])\/\/[^\n]*/g, (m, p) => p);
}
function literals(label, src) {
  const out = [];
  const clean = stripComments(src);
  const re = /(["'`])((?:(?!\1)[^\\]|\\.)*)\1/g;
  let m;
  while ((m = re.exec(clean)))
    out.push({ label, line: clean.slice(0, m.index).split("\n").length, text: m[2] });
  return out;
}
const ALL_LITERALS = FILES.flatMap(f => literals(f.label, f.src));

// ── R1. "더 맞힌다"로 팔지 않는다 ──────────────────────────────────────────────────
// 방향 적중은 +0.36%p 뿐이고 하락장 +0.03%p · 횡보장 +0.02%p — 사용자가 도움이 가장 필요한
// 두 국면에서 32종은 5종 대비 아무것도 사지 못한다. 그 위에 "더 정확합니다"를 쓰면 거짓말이다.
const SALES_BANNED = [
  /더\s*맞[힌히추]/,          // "더 맞힙니다" · "더 맞춥니다"
  /정확도가?\s*(더\s*)?높/,   // "정확도가 높습니다"
  /적중률이\s*(더\s*)?높/,
  /더\s*정확/,
  // 티어 격차를 %p 로 못박는 문구 일체. 시안은 "2%p 만 오릅니다"라고 샘플을 적었는데 실측은
  // +0.36%p 로 **다섯 배 작다.** 처음엔 그 문장을 통째로 열거했다가 "오르"와 "오릅"이 달라
  // 그냥 새는 것을 변이 검증에서 봤다 — 문장을 맞히려 들면 늘 진다. 격차 수치 자체를 막는다:
  // 측정값은 리터럴이 아니라 산출물에서 온다(R3 와 같은 원칙).
  /\d+(\.\d+)?\s*%p/,
];
// 예외는 주석 달린 목록으로만 둔다 — 조용한 건너뛰기 금지(P1 판정 P 와 같은 원칙).
const SALES_EXEMPT = [
  // (현재 없음. 추가할 때는 왜 이 문구가 성능 주장이 아닌지를 여기 적을 것.)
];
test("R1 — 판매 문구가 '더 맞힌다'를 주장하지 않는다", () => {
  const bad = [];
  Object.keys(S.t).forEach(k => {
    const v = String(S.t[k]);
    if (SALES_EXEMPT.indexOf(k) >= 0) return;
    SALES_BANNED.forEach(re => { if (re.test(v)) bad.push("strings.t." + k + ": " + v); });
  });
  ALL_LITERALS.forEach(o => {
    SALES_BANNED.forEach(re => { if (re.test(o.text)) bad.push(o.label + ":" + o.line + " " + JSON.stringify(o.text)); });
  });
  assert.deepEqual(bad, [],
    "성능을 '더 맞힌다'로 파는 문구 " + bad.length + "건:\n" + bad.join("\n") +
    "\n심화가 파는 것은 정직함이다 — 확률 오차 4배·콘 커버 +3.3%p·예측 폭 축소. 방향은 +0.36%p 뿐이다.");
});

// ── R3. 적중률 숫자는 리터럴이 될 수 없다 ─────────────────────────────────────────────
// 화면이 내는 적중률은 전부 측정 산출물(MSBacktest → report-model)에서 와야 한다. 소스에
// 적힌 순간 그것은 "어떤 측정인지 아무도 모르는 숫자"가 되고, 전문분석의 경우엔 **측정한 적
// 없는 숫자**가 된다(사용자마다 가중치가 달라 하나의 적중률로 환원되지 않는다. 재지 않았고
// 재서도 안 된다). 시안 10a·18c 의 "예상 적중률 64%"가 정확히 그 형태다.
const ACC_WORD = /적중|정확도|hit\s*rate/i;
const PCT_NUM = /\d{1,3}(\.\d+)?\s*%/;
test("R3 — 적중률 수치가 소스 리터럴로 박혀 있지 않다", () => {
  const bad = [];
  const check = (label, text) => {
    if (ACC_WORD.test(text) && PCT_NUM.test(text)) bad.push(label + " " + JSON.stringify(text));
  };
  Object.keys(S.t).forEach(k => check("strings.t." + k, String(S.t[k])));
  ALL_LITERALS.forEach(o => check(o.label + ":" + o.line, o.text));
  assert.deepEqual(bad, [],
    "적중률 숫자가 리터럴로 있다 " + bad.length + "건:\n" + bad.join("\n") +
    "\n측정값은 MSBacktest → MSReportModel 을 통해서만 화면에 온다. 전문분석 적중률은 아예 존재하지 않는다.");
});

// ── R2. 적중률을 보이면 베이스라인을 함께 보인다 ────────────────────────────────────
// 두 값이 **같은 측정**에서 나와야 한다. tier-report 의 61.0 을 다른 하네스 옆에 적으면
// 숫자는 같아 보여도 잰 대상이 달라 거짓 비교가 된다 — 그래서 상수가 아니라 같은 요약의
// 필드(baselineAlwaysUp)를 쓴다.
const MODEL = require("../www/report-model.js");
test("R2 — hitRate 는 베이스라인을 함께 돌려준다(같은 측정에서)", () => {
  const summary = { bullHitRate: 0.617, bearHitRate: 0.425, baselineAlwaysUp: 0.6096, nForecasts: 31971, nSeries: 87 };
  const r = MODEL.hitRate(summary, "bull");
  assert.strictEqual(r.right, 61.7);
  assert.strictEqual(r.baseline, 61.0, "베이스라인을 안 돌려준다 — 적중률만 단독으로 나간다");
});
test("R2 — 베이스라인이 없으면 baseline 이 null 이다(화면이 적중 행을 감추는 신호)", () => {
  const r = MODEL.hitRate({ bullHitRate: 0.617 }, "bull");
  assert.strictEqual(r.baseline, null,
    "옛 생성물(baselineAlwaysUp 없음)에서 베이스라인을 지어냈다");
});

const REPORT = readFileSync(new URL("../www/screens/report.js", import.meta.url), "utf8");
// P1a Task 3 가 확신%·적중/오답·베이스라인 렌더를 verdict 카드에서 걷어냈다(basic 은 도구가
// 5개뿐이라 퍼센트를 쓰면 오독된다, 설계서 §3.2) — 그 내용은 report-blocks.js 의
// PENDING.hitrate 로 P1b(심화 리포트)에 넘어갔다. 지금 report.js 에 적중률 렌더 자체가 없으니
// "베이스라인 없이 그리지 않는다"는 공허하게 참이다 — 이 시험은 그 공백 동안 ①정말 아무것도
// 안 그리고 있는지, ②그 사실이 PENDING 에 정직하게 남아 시트가 못 팔게 막는지를 본다.
// P1b 가 hitrate 를 지으면 이 분기는 다시 걸려야 한다(가드 문자열이 그대로 필요).
test("R2 — 화면이 적중률을 그린다면 반드시 베이스라인과 함께다(지금은 PENDING.hitrate 라 안 그린다)", () => {
  const hasHitRender = /MSStr\.t\.rpHitRight|hit\.baseline/.test(REPORT);
  if (!hasHitRender) {
    assert.match(REPORT, /hitrate:\s*true/,
      "적중률 렌더가 없는데 PENDING.hitrate 도 없다 — 단계 선택 시트가 못 그리는 것을 팔게 된다");
    return;
  }
  assert.match(REPORT, /if \(hit && hit\.baseline == null\) hit = null;/,
    "베이스라인이 없을 때 적중 행을 감추지 않는다 — 비교 대상 없는 숫자는 '동전보다 낫다'로 읽힌다");
  const hitAt = REPORT.indexOf("MSStr.t.rpHitRight");
  const baseAt = REPORT.indexOf("MSStr.t.rpHitBaseA");
  assert.ok(hitAt > 0 && baseAt > 0, "적중률 또는 베이스라인 렌더가 없다");
  assert.ok(baseAt > hitAt, "베이스라인이 적중률보다 먼저 그려진다 — 순서가 뒤집혔다");
});

const SYNC = readFileSync(new URL("../sync-engine.mjs", import.meta.url), "utf8");
test("R2 — 생성물이 베이스라인 필드를 실어 나른다", () => {
  assert.match(SYNC, /baselineAlwaysUp:\s*o\.baselineAlwaysUp/,
    "sync-engine 이 baselineAlwaysUp 을 요약에 안 넣는다 — 화면이 영원히 적중 행을 감춘다");
});

// ── R2 확장 — 적중률의 "지표 수" 도 리터럴이 될 수 없다 ─────────────────────────────
// [리뷰 Critical, 2026-08-19] 범위 주석이 종목·기간(n·series)은 밝히면서 "몇 개 도구로
// 쟀는지"(graphIndicators)는 빠뜨리고 있었다 — 사용자는 이 리포트가 32개(또는 30개)로
// 분석했다는 배지를 이미 본 뒤라, 도구 수 없는 적중률을 "그 32개짜리 판정의 성적"으로
// 읽는다. R2 의 베이스라인 규율과 뿌리가 같다(비교·범위 없는 숫자는 안 낸다) — 그래서
// 이름도 R2 를 그대로 잇는다(새 R6 로 쪼개지 않는다).
test("R2 — hitRate 는 지표 수(graphIndicators)도 생성물에서 그대로 돌려준다", () => {
  const summary = { bullHitRate: 0.617, baselineAlwaysUp: 0.6096, nForecasts: 31971, nSeries: 87, graphIndicators: 19 };
  const r = MODEL.hitRate(summary, "bull");
  assert.strictEqual(r.indicators, 19, "생성물의 graphIndicators 를 안 실어 나른다");
});
test("R2 — graphIndicators 가 없는 생성물은 indicators 가 null 이다(지어내지 않는다)", () => {
  const r = MODEL.hitRate({ bullHitRate: 0.617, baselineAlwaysUp: 0.6096, nForecasts: 31971, nSeries: 87 }, "bull");
  assert.strictEqual(r.indicators, null, "graphIndicators 없는데 지표 수를 지어냈다");
});
test("R2 — 화면이 적중률을 그린다면 지표 수도 hit.indicators 에서 읽어 함께 그린다(리터럴 19 금지)", () => {
  const hasHitRender = /MSStr\.t\.rpHitRight|hit\.baseline/.test(REPORT);
  if (!hasHitRender) return;   // 위 R2 시험과 같은 가드 — 렌더 자체가 없으면 이 시험도 공허하게 참
  assert.match(REPORT, /hit\.indicators/,
    "적중률 블록이 hit.indicators 를 안 읽는다 — 지표 수를 리터럴로 박았거나 아예 안 보여준다");
  assert.match(REPORT, /hit\.n == null \|\| hit\.series == null \|\| hit\.indicators == null/,
    "n·series 가 없으면 감추면서 indicators 가 없을 때는 감추지 않는다 — 규율이 절반만 적용됐다");
  // buildHitrate() 함수 본문 안에서만 검사한다 — 파일 전체를 훑으면 report-model.js 주석
  // 인용(사람이 쓴 설명 문장) 등 무관한 자리의 "19"까지 걸려 오탐이 난다.
  const fnAt = REPORT.indexOf("function buildHitrate()");
  assert.ok(fnAt > 0, "buildHitrate() 함수를 못 찾았다");
  const fnEnd = REPORT.indexOf("\n    }", fnAt);
  const fnBody = REPORT.slice(fnAt, fnEnd > 0 ? fnEnd : fnAt + 2000);
  assert.doesNotMatch(fnBody, /[^.\w]19[^.\w]/,
    "buildHitrate() 안에 리터럴 19 가 있다 — 생성물이 바뀌면 화면이 거짓말한다");
});

test("R2 — 생성물이 지표 수(graphIndicators) 필드를 실어 나른다", () => {
  assert.match(SYNC, /graphIndicators:\s*r\.graphIndicators/,
    "sync-engine 이 graphIndicators 를 요약에 안 넣는다 — 화면이 영원히 도구 수를 못 보여준다");
});

// ── R4 대조군. 계산된 값은 마음껏 보여준다 ───────────────────────────────────────────
// R1~R3 은 **성능 주장**에만 적용된다. 예측 폭·동의 개수·확신 퍼센트는 엔진 출력이지
// 성능 주장이 아니다. 이쪽이 오탐이면 이 관문이 화면을 마비시킨다.
test("R4 — 계산된 값은 걸리지 않는다(오탐 방지)", () => {
  const ok = ["234.2 ± 1.1", "32개 중 24개", "심화 ± 1.1 → 내 설정 ± 0.9", "확신 63%",
              "상승 확률 71%", "80% 콘", "3 중 2"];
  ok.forEach(t => {
    SALES_BANNED.forEach(re => assert.ok(!re.test(t), "R1 오탐: " + t));
    assert.ok(!(ACC_WORD.test(t) && PCT_NUM.test(t)), "R3 오탐: " + t);
  });
});
