// 이 카드가 개편의 판매 논거다. 숫자가 틀리면 나머지 전부를 잃는다(시안 7a).
//
// 컨트롤러 판정 D1(리뷰 2026-08-19) — 원래 브리프 Step 1 의 4건 중 "심화의 폭이 기본의
// 절반 가까이여야 카드가 말이 된다"(pred 인자로 lo/hi/mid/err 를 받아 종목별 폭을 비교)는
// 실측(리뷰어 backtest/earn-ohlc.json 30종목×5구간=150창: 심화가 더 좁은 비율 47.3%·폭
// 비율 중앙값 1.001·"절반" 사례 0/150)으로 전제가 깨져 **제거했다.** rows() 는 더 이상
// pred 인자를 받지 않는다 — 카드가 이제 모집단 지표(방향 적중·콘 커버리지·ECE)만 말하기
// 때문이다. 나머지 3건(리터럴 금지·custom rate null·기준선)은 그대로 유효해 남긴다.
import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const C = require("../www/tier-compare.js");
const SRC = readFileSync(new URL("../www/tier-compare.js", import.meta.url), "utf8");

test("적중률은 MSBacktest 에서만 온다 — 리터럴 금지", () => {
  const body = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'\\])\/\/[^\n]*/gm, (m,p)=>p);
  assert.ok(!/\b(58|61|63|67)\s*[.%]/.test(body), "적중률처럼 보이는 리터럴이 있다");
  assert.match(body, /MSBacktest/, "실측 출처를 안 읽는다");
});

test("전문 티어는 실측이 없으므로 rate 가 null 이다 — 화면이 '측정 중'을 그린다", () => {
  const rows = C.rows();
  const pro = rows.filter(r => r.tier === "custom")[0];
  assert.strictEqual(pro.rate, null, "없는 값을 지어냈다");
});

test("방향 적중률은 자명 기준선을 동반한다", () => {
  assert.ok(C.baseline() > 0.5, "기준선을 노출하지 않으면 58%가 좋아 보인다");
});

// ── 여기부터 이 태스크가 더한 시험(원 라운드) ──────────────────────────────────────────

test("기본·심화 rate 는 실측(현재 데이터: 58.2 / 58.5)이고 리터럴이 아니라 계산값이다", () => {
  const rows = C.rows();
  const basic = rows.filter(r => r.tier === "basic")[0];
  const full = rows.filter(r => r.tier === "full")[0];
  assert.ok(typeof basic.rate === "number" && basic.rate > 50 && basic.rate < 70, "기본 rate 가 그럴듯한 범위 밖이다: " + basic.rate);
  assert.ok(typeof full.rate === "number" && full.rate >= basic.rate, "심화 rate 가 기본보다 낮다 — 실측과 안 맞는다");
});

test("심화 카드의 note 는 기본→심화 두 rate 숫자와 콘 커버리지를 실제로 담는다(문구가 비어있지 않다)", () => {
  const rows = C.rows();
  const full = rows.filter(r => r.tier === "full")[0];
  assert.ok(full.note && full.note.length > 10, "심화 카드에 불리한 사실 문장이 없다");
  assert.ok(/%p/.test(full.note), "적중률 차이(%p)가 문장에 없다");
  assert.ok(/콘 커버리지/.test(full.note), "심화가 파는 것(범위·콘 커버리지)을 말하지 않는다");
});

test("전문 카드에는 '기본분석보다 낮아질 수 있다' 경고가 있다", () => {
  const rows = C.rows();
  const pro = rows.filter(r => r.tier === "custom")[0];
  assert.ok(pro.note && /낮아질/.test(pro.note), "전문 카드에 하향 경고 문구가 없다: " + pro.note);
});

test("axisPos 는 55~70% 확대 축 위의 위치를 0~100 으로 클램프한다", () => {
  assert.strictEqual(C.axisPos(55), 0);
  assert.strictEqual(C.axisPos(70), 100);
  assert.strictEqual(C.axisPos(40), 0, "축 아래 값은 0으로 클램프돼야 한다");
  assert.strictEqual(C.axisPos(90), 100, "축 위 값은 100으로 클램프돼야 한다");
  const mid = C.axisPos(62.5);
  assert.ok(mid > 45 && mid < 55, "축 중앙 근처 값이 아니다: " + mid);
});

// ── 여기부터 리뷰(2026-08-19) D1·I1·I2·I3·I5 대응 시험 ────────────────────────────────

test("D1 — rows() 는 이제 모집단 지표(방향·커버리지·ECE)를 셋 다 낸다, 인자 없이", () => {
  const rows = C.rows();
  assert.strictEqual(rows.length, 3, "행이 3개가 아니다");
  const basic = rows.filter(r => r.tier === "basic")[0];
  const full = rows.filter(r => r.tier === "full")[0];
  assert.ok(typeof basic.coverage === "number" && basic.coverage > 50, "기본 콘 커버리지가 없다");
  assert.ok(typeof basic.ece === "number", "기본 ECE 가 없다");
  assert.ok(typeof full.coverage === "number" && full.coverage > basic.coverage,
    "심화 콘 커버리지가 기본보다 높지 않다 — 실측(73.8%→77.1%)과 안 맞는다");
  assert.ok(typeof full.ece === "number" && full.ece < basic.ece,
    "심화 ECE 가 기본보다 낮지 않다 — 실측(1.05%p→0.27%p)과 안 맞는다");
  // 종목별 폭 개념 자체가 사라졌다 — 이 필드들이 더 이상 존재하지 않아야 한다(옛 계약의
  // 잔재가 남아 있으면 다음 사람이 다시 그 필드를 읽어 죽은 코드를 되살린다).
  ["lo", "hi", "width"].forEach(k => {
    assert.strictEqual(basic[k], undefined, "옛 필드 " + k + " 가 남아 있다(basic)");
    assert.strictEqual(full[k], undefined, "옛 필드 " + k + " 가 남아 있다(full)");
  });
});

test("I1 — scope() 가 이 수치의 범위(n·시리즈 수)를 실측에서 낸다", () => {
  const sc = C.scope();
  assert.ok(sc, "scope 가 없다");
  assert.ok(sc.n > 1000, "표본 수가 그럴듯하지 않다: " + sc.n);
  assert.ok(sc.series > 10, "시리즈 수가 그럴듯하지 않다: " + sc.series);
});

test("I2 — ECE 비율은 반올림된 두 값이 아니라 원값으로 나눈다(이중반올림 회피)", () => {
  // 현재 데이터: basic ECE(raw)=0.010540489818898368, deep ECE(raw)=0.0026949422914516966.
  // 원값 비율 = 3.9109…→ round = 4. 만약 소스가 pct1/pct2 로 반올림한 두 값(1.1/0.3=3.67 이나
  // 표시자리에 따라 다른 값)을 나눴다면 이 특정 데이터에서는 우연히 같은 반올림 결과(4)가
  // 나올 수 있어 결과값만으로는 이중반올림을 구분 못 한다 — 그래서 소스가 반올림 함수
  // (pct1/pct2)를 나눗셈의 **피연산자**로 쓰지 않는지를 직접 본다.
  const body = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'\\])\/\/[^\n]*/gm, (m,p)=>p);
  assert.ok(!/pct[12]\([^)]*\)\s*\/\s*pct[12]\(/.test(body),
    "반올림한 값끼리 직접 나눈다 — 원값(raw fraction)으로 나눈 뒤에만 반올림해야 한다");
  assert.match(body, /basic\.calibrationECE\s*\/\s*deep\.calibrationECE/,
    "ECE 비율을 원값(calibrationECE)으로 계산하지 않는다");
});

test("I2 — 방향 적중률 차이도 원값으로 계산한다(현재 데이터로 +0.4%p, 반올림된 값끼리 빼면 +0.3%p 가 나와 어긋난다)", () => {
  const rows = C.rows();
  const full = rows.filter(r => r.tier === "full")[0];
  assert.match(full.note, /\+0\.4%p/, "원값 기준 차이(+0.4%p)가 아니다: " + full.note);
});

test("I3 — 방향 동사가 부호로 갈린다(하드코딩된 '오릅니다' 단일 조각이 아니다)", () => {
  const body = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'\\])\/\/[^\n]*/gm, (m,p)=>p);
  assert.match(body, /diffPct\s*>=\s*0/, "부호 분기가 없다");
  assert.match(body, /T\.tcDeltaUp/, "상승 조각을 안 쓴다");
  assert.match(body, /T\.tcDeltaDown/, "하락 조각을 안 쓴다");
});

test("M1 — 축 상수(AXIS_MIN/MAX)가 export 돼 화면이 런타임에 읽을 수 있다", () => {
  assert.strictEqual(C.AXIS_MIN, 55);
  assert.strictEqual(C.AXIS_MAX, 70);
});
