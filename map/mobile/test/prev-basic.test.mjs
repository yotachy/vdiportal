// P2 §4.2 — 8a 직전 상태 대조(사용자 결정 2026-08-17).
//
// 이 블록이 존재하는 이유: 티어 실측이 말하는 것은 "심화가 방향을 더 맞힌다"(+0.36%p)가
// 아니라 "폭이 정직해진다"(확률 오차 4배·콘 커버 +3.3%p)인데, 대조 없이 심화 값만 단독으로
// 놓으면 사용자는 그 정직해짐을 볼 방법이 없다. 폭이 4.0 에서 ±1.1 로 좁아진 것을
// **직전 값 옆에서** 봐야 "무엇을 샀는지"가 성립한다.
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
