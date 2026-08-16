// P2 §4 — 티어별 정보 블록 3 / 8 / 9.
//
// 블록 3/8/9 는 세 벌의 화면이 아니라 **같은 렌더러가 다른 목록을 받는 것**이다. 세 벌로 쓰면
// 공통 블록을 고칠 때 세 곳을 고쳐야 하고, 한 곳을 빠뜨려도 그 티어를 열기 전엔 아무도 모른다.
import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const B = require("../www/report-blocks.js");
const G = require("../www/graph.js");
const FC = require("../../forge-core.js");
const S = require("../www/strings.js");

const REPORT = readFileSync(new URL("../www/screens/report.js", import.meta.url), "utf8");
const INDEX = readFileSync(new URL("../www/index.html", import.meta.url), "utf8");

test("index.html — report-blocks.js 가 소비자(screens/report.js)보다 앞에 있다", () => {
  const a = INDEX.indexOf("report-blocks.js"), b = INDEX.indexOf("screens/report.js");
  assert.ok(a > 0, "report-blocks.js 가 로드되지 않는다");
  assert.ok(a < b, "선언이 소비자보다 뒤에 로드된다 — 클래식 스크립트라 순서가 의미를 갖는다");
});

// 시안 18a: "블록 3개 = 판정 + 차트 + 범위". 머리(가격·배지)·빈 공간·해제 카드는 세지 않는다.
test("기본분석은 정보 블록 3개다 — 시안 18a", () => {
  assert.strictEqual(B.countOf("basic"), 3,
    "기본 블록 구성: " + B.orderOf("basic").join(" → "));
});

// 18a 의 빈 공간은 버그가 아니다 — "여기까지가 무료"를 스크롤 부재로 전달한다.
// 다음 사람이 "아래가 어색하다"며 채우는 것을 막는다.
test("기본분석에는 의도된 빈 공간이 있고, 해제 카드가 그 아래 맨 끝이다", () => {
  const order = B.orderOf("basic");
  const sp = order.indexOf("spacer"), un = order.indexOf("unlock");
  assert.ok(sp > 0, "18a 의 의도된 빈 공간(spacer)이 없다 — 채우지 말 것");
  assert.ok(un === order.length - 1, "해제 카드가 맨 끝이 아니다");
  assert.ok(sp < un, "빈 공간이 해제 카드보다 뒤에 있다 — 카드가 화면 중간에 뜬다");
});

test("기본분석은 지평 세 줄을 다 주지 않는다 — 1주·1개월은 심화가 판다", () => {
  assert.match(REPORT, /if \(tier === "basic"\) rows = rows\.slice\(0, 1\);/,
    "기본에서 지평 행을 자르지 않는다 — 3단 비교표의 '기간별'이 무료가 된다");
});

// 전문 ⊇ 심화. 한 겹이라도 빠지면 5스쿱 낸 사람이 손해다(인벤토리 §3).
test("전문분석은 심화의 블록을 하나도 빠뜨리지 않는다", () => {
  const full = B.orderOf("full"), custom = B.orderOf("custom");
  const missing = full.filter(k => custom.indexOf(k) < 0);
  assert.deepEqual(missing, [], "전문에서 사라진 심화 블록: " + missing.join(", "));
  assert.strictEqual(B.countOf("custom"), B.countOf("full") + 1,
    "전문은 심화 + 조절판 하나다 — 지금 " + B.countOf("custom") + " vs " + B.countOf("full"));
});

// 시안 18b 는 블록을 8개로 센다: 판정 · 차트존 · **서브패널** · 내일 · 반대 · 통계 · 판독문 · CTA.
// 우리는 7이다. 빠진 하나는 내용이 아니라 **그리는 방식**의 차이다 — 시안은 서브패널 3열을
// 차트와 별도 프레임으로 두고 세지만, 우리 서브패널은 같은 캔버스 안에 적층된다(chart-layout 의
// panels). 따로 세면 DOM 에 없는 블록을 있다고 적는 셈이라 7 로 센다.
// 내용 대조: 판정✓ 차트존(+서브패널)✓ 내일(+8a 대조)✓ 반대✓ 주기 통계✓ 판독문 링크✓ CTA✓.
test("심화는 시안 18b 의 구성이다 — 블록 7(시안 셈법 8, 차이는 서브패널 셈법뿐)", () => {
  assert.strictEqual(B.countOf("full"), 7,
    "심화 블록 수가 7 이 아니다: " + B.orderOf("full").join(" → "));
  ["signals", "reasoning", "missing"].forEach(k =>
    assert.ok(B.orderOf("full").indexOf(k) < 0,
      k + " 가 심화에 남아 있다 — 판독문 화면(20a)으로 옮긴 블록이다"));
  assert.ok(B.orderOf("full").indexOf("readings") >= 0, "판독문 링크가 없다 — 옮긴 내용에 닿을 길이 없다");
});

test("전문분석의 조절판은 판정 위다 — 시안 18c 는 조절판을 맨 위에 둔다", () => {
  const order = B.orderOf("custom");
  assert.ok(order.indexOf("weights") >= 0, "조절판 블록이 없다");
  assert.ok(order.indexOf("weights") < order.indexOf("verdict"), "조절판이 판정보다 아래다");
});

test("모르는 티어는 기본 구성으로 떨어진다 — 오타가 유료 화면을 열지 않는다", () => {
  ["nope", "", null, undefined].forEach(t =>
    assert.deepEqual(B.orderOf(t), B.orderOf("basic"), "tier=" + JSON.stringify(t)));
});

test("orderOf 는 복사본을 준다 — 호출부가 선언을 망가뜨릴 수 없다", () => {
  const a = B.orderOf("full");
  a.push("hacked");
  assert.deepEqual(B.orderOf("full").indexOf("hacked"), -1, "선언 배열이 밖에서 변형됐다");
});

// 렌더러가 선언을 실제로 도는지. 예전엔 draw() 안에 appendChild 가 순서대로 나열돼 있었다.
test("report.js 는 블록을 선언 순서대로 돈다 — 하드코딩 나열이 아니다", () => {
  assert.match(REPORT, /MSReportBlocks\.orderOf\(tier\)\.forEach/,
    "선언을 안 돌고 있다");
  const body = REPORT.replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(body, /scr\.appendChild\(buildVerdict\(/,
    "판정 블록을 선언 밖에서 직접 붙인다 — 티어를 안 본다");
  assert.doesNotMatch(body, /scr\.appendChild\(buildHorizons\(/,
    "지평 블록을 선언 밖에서 직접 붙인다");
});

// 선언에 있는 이름은 전부 만드는 함수가 있어야 한다 — 없으면 그 블록은 조용히 사라진다.
// 단 weights 는 Task 8 이 올 때까지 의도적으로 비어 있고, 그 사실이 여기 드러나야 한다.
const NOT_BUILT_YET = {
  weights: "전문분석 조절판 — Task 8(전문분석 신설)이 채운다. 선언에 먼저 있는 이유는 " +
           "전문 ⊇ 심화 관문이 그 자리를 지금부터 지키게 하기 위해서다."
};
test("선언의 모든 블록 이름이 렌더러의 표에 있다(미구현은 사유와 함께 드러난다)", () => {
  const table = REPORT.match(/var BUILD = \{([\s\S]*?)\n        \};/);
  assert.ok(table, "BUILD 표를 못 찾았다");
  const keys = [...table[1].matchAll(/^\s{10}([a-zA-Z]+)\s*:/gm)].map(m => m[1]);
  const declared = [...new Set([].concat(B.orderOf("basic"), B.orderOf("full"), B.orderOf("custom")))];
  const missing = declared.filter(k => keys.indexOf(k) < 0);
  assert.deepEqual(missing, [], "선언에 있는데 표에 없는 블록(조용히 사라진다): " + missing.join(", "));
  const dead = keys.filter(k => declared.indexOf(k) < 0);
  assert.deepEqual(dead, [], "표에만 있고 어느 티어에도 없는 블록: " + dead.join(", "));
  // 미구현 항목은 null 로 표에 있어야 한다 — 이름만 있고 함수가 없다는 사실이 코드에 남는다.
  Object.keys(NOT_BUILT_YET).forEach(k =>
    assert.match(table[1], new RegExp(k + "\\s*:\\s*null"),
      k + " 가 표에 null 로 있지 않다 — 구현됐다면 이 목록에서 빼고, 아니라면 null 로 둘 것"));
});

// 시안 18a 의 "이 화면에 27개 지표와 차트 절반이 빠져 있습니다" — 27 은 32 − 5 다.
// 리터럴로 적으면 지표가 늘어도 화면은 27 이라고 계속 말한다.
test("해제 카드의 가려진 지표 수는 유도된다 — 리터럴 27 이 아니다", () => {
  assert.match(REPORT, /ForgeCore\.indicatorCount - MSGraph\.BASIC\.length/,
    "가려진 지표 수를 유도하지 않는다");
  assert.strictEqual(FC.indicatorCount - G.BASIC.length, 27,
    "오늘의 값이 27 이 아니다(엔진 " + FC.indicatorCount + " − 기본 " + G.BASIC.length + ") — " +
    "시안 문구가 낡았거나 티어 구성이 바뀌었다. 화면은 유도값을 쓰므로 자동으로 맞지만, 시안 대조가 필요하다");
  assert.ok(!/27개 지표/.test(String(S.t.rpLockedA) + String(S.t.rpLockedB)),
    "문구에 27 이 리터럴로 박혀 있다");
});
