// P2 §4.2 — 8a 직전 상태 대조(사용자 결정 2026-08-17).
//
// [M3, 2026-08-19 정정] 이 머리 주석은 "폭이 4.0 에서 ±1.1 로 좁아진다"고 적어 뒀었다 —
// 그 전제는 두 겹으로 틀렸다. ①단위가 섞여 있다(4.0 은 전폭 hi-lo, ±1.1 은 반폭이라 애초에
// 같은 값을 비교한 게 아니었다, 리뷰 C2). ②"항상 좁아진다"는 방향 자체가 틀렸다 — 최종
// 리뷰어가 저장소 실표본(map/backtest/earn-ohlc.json 30종목, tools/measure-sentence-
// signals.mjs 의 buildWindows N=240·STEP=45, basicGraph vs full32Graph, 프로덕션과 정확히
// 같은 조건)으로 2813창을 재측정한 결과는 **넓어진 사례 57.4%(1616창) · 좁아진 사례
// 42.6%(1197창)**, 폭 비율(전폭 기준) 중앙값 1.027배였다(리뷰 C1). 그래서 report.js 의
// buildPrevCompare()/comparePrevDir() 는 이제 두 폭(둘 다 전폭)을 실제로 재서 방향(넓어짐·
// 좁아짐·거의 같음)을 고른다 — 이 파일이 다루는 prevBasic()/snapBasic()(스냅샷을 만들고
// 읽는 두 규칙)은 그 비교의 **재료**만 담당한다.
//
// 이 블록이 존재하는 이유: 티어 실측이 말하는 것은 "심화가 방향을 더 맞힌다"가 아니라
// "폭이 정직해진다"(확률 오차·콘 커버리지가 달라진다는 사실 자체)인데, 대조 없이 심화 값만
// 단독으로 놓으면 사용자는 그 달라짐을 볼 방법이 없다. 직전 값과 지금 값을 **같은 단위로
// 나란히** 놓아야 "무엇이 달라졌는지"가 성립한다(리뷰 C2가 정정한 부분).
//
// 규칙 둘이 이 블록의 정직성 전부다. 둘 다 "없을 때 무엇을 하지 않는가"라서, 눈으로는
// 확인이 안 된다 — 대조가 안 그려진 화면은 그냥 대조가 없는 화면처럼 보인다.
import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
const REPORT = readFileSync(new URL("../www/screens/report.js", import.meta.url), "utf8");
const S = (await import("node:module")).createRequire(import.meta.url)("../www/strings.js");

// 소스에서 prevBasic() 본문만 도려낸다 — 다른 함수의 return null 이 섞이면 아무 의미가 없다.
function bodyOf(name) {
  const at = REPORT.indexOf("function " + name + "(");
  assert.ok(at > 0, name + " 이 없다");
  const brace = REPORT.indexOf("{", at);
  let d = 0;
  for (let i = brace; i < REPORT.length; i++) {
    if (REPORT[i] === "{") d++;
    else if (REPORT[i] === "}" && --d === 0) return REPORT.slice(brace, i + 1);
  }
  throw new Error("본문을 못 닫았다");
}
const PREV = bodyOf("prevBasic");
const SNAP = bodyOf("snapBasic");

test("G1 — 직전 값이 없으면 대조를 통째로 생략한다(추정치·대시로 채우지 않는다)", () => {
  assert.match(PREV, /if \(!snap\) return null;/, "스냅샷이 없을 때 null 을 안 준다");
  assert.match(PREV, /isFinite\(snap\.lo\)|isFinite\(snap\.hi\)/, "값이 유한한지 안 본다");
  // 없을 때 **무언가로 채우는** 형태가 없는지. 문자열 리터럴 일반은 금지할 수 없다
  // (티어 이름 비교에 "basic" 이 정당하게 있다) — 채우기의 실제 모양을 본다:
  // 대시·문구 참조·0 으로의 폴백.
  const code = PREV.replace(/\/\/[^\n]*/g, "");
  assert.ok(code.indexOf("MSStr") < 0, "prevBasic() 이 화면 문구를 참조한다 — 빈칸을 채우려는 신호다");
  assert.ok(code.indexOf("\u2014") < 0 && code.indexOf("-") < 0 || !/return\s*["'`]/.test(code),
    "prevBasic() 이 문자열을 돌려준다 — 없으면 null 이어야 한다");
  assert.ok(!/\|\|\s*0\b/.test(code), "값이 없을 때 0 으로 떨어진다 — 0 은 추정치다");
});

test("G2 — 같은 기준일(asOf)의 값만 대조에 쓴다", () => {
  assert.match(PREV, /snap\.asOf !== asOfOf\(data\)/,
    "기준일을 대조하지 않는다 — 어제 값과 오늘 값을 나란히 놓으면 하루 차이가 티어 차이로 읽힌다");
  assert.match(SNAP, /if \(!asOf\) return;/,
    "기준일을 모를 때도 스냅샷을 적는다 — G2 를 지킬 수 없는 값이 저장된다");
});

test("대조는 심화 이상에서만 — 기본이 자기 자신과 비교하지 않는다", () => {
  assert.match(PREV, /if \(tier === "basic"\) return null;/, "기본에서도 대조를 시도한다");
});

test("스냅샷은 기본 분석 직후에만 찍힌다 — 심화 결과로 덮으면 자기 자신과의 비교가 된다", () => {
  // P1a Task 4 가 한때 같은 basic 전용 가드 안에 computeFullPreview() 를 더했었다(3단
  // 대조의 종목별 심화 프리뷰 재료) — 컨트롤러 판정 D1(리뷰 2026-08-19)로 그 프리뷰가
  // 통째로 걷어져 단문으로 되돌아왔다(카드가 이제 모집단 지표만 말한다, tier-compare.js
  // 헤더 주석 참고). 그래서 원래 단문 형태로 다시 잰다.
  assert.match(REPORT, /if \(tier === "basic"\) snapBasic\(\);/,
    "티어를 안 보고 스냅샷을 찍는다");
  const calls = REPORT.match(/snapBasic\(\)/g) || [];
  assert.strictEqual(calls.length, 2, "snapBasic 정의 1 + 호출 1 이어야 한다(지금 " + calls.length + ")");
});

test("대조 행은 폭을 함께 적는다 — 이 블록이 파는 것이 폭의 변화다", () => {
  assert.match(REPORT, /MSStr\.t\.rpWidthA \+ prev\.width\.toFixed\(1\)/, "직전 폭을 안 적는다");
  assert.ok(S.t.rpPrevBasic && S.t.rpWidthA, "대조 문구가 strings 에 없다");
  // "—" 를 대조용 문구로 만들어 두면 다음 사람이 그것을 빈칸 채우기에 쓴다.
  assert.ok(!/^—$/.test(String(S.t.rpPrevBasic)), "대조 라벨이 대시다");
});

test("19b 문안 — 기간이 갈릴 때만 평이한 서술이 붙는다(없는 대립을 만들지 않는다)", () => {
  assert.match(REPORT, /d1\.dir !== "flat" && mN\.dir !== "flat" && d1\.dir !== mN\.dir/,
    "방향이 같거나 무방향일 때도 '반대입니다' 문장을 낸다");
  assert.ok(S.t.rpHzMixedB.indexOf("짧게 볼 때만") >= 0, "19b 의 단서 문구가 빠졌다");
});
