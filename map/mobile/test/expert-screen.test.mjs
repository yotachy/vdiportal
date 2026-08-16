// P2 §5.3~5.4 — 전문분석 편집기(10a)와 조절판(18c).
//
// 이 화면의 가장 큰 위험은 "조절판이 장식이 되는 것"이고, 두 번째는 "측정한 적 없는 적중률을
// 거는 것"이다. 전자는 custom-weights.test.mjs 가 엔진까지 실측으로 잰다. 여기서는 화면 쪽
// 계약을 본다.
import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const S = require("../www/strings.js");
const T = require("../www/ind-tiers.js");

const XP = readFileSync(new URL("../www/screens/expert.js", import.meta.url), "utf8");
const REPORT = readFileSync(new URL("../www/screens/report.js", import.meta.url), "utf8");
const SHEET = readFileSync(new URL("../www/tier-sheet.js", import.meta.url), "utf8");
const INDEX = readFileSync(new URL("../www/index.html", import.meta.url), "utf8");

test("index.html — 편집기가 리포트보다 먼저 로드된다(리포트가 연다)", () => {
  const x = INDEX.indexOf("screens/expert.js"), r = INDEX.indexOf("screens/report.js");
  assert.ok(x > 0 && x < r, "편집기 로드 순서가 소비자보다 뒤다");
});

// R3 — 전문분석 적중률은 존재하지 않는다. 시안 10a 의 "예상 적중률 64% + 기준선 진행바"와
// 18c 의 같은 축은 구현하지 않는다. 그 자리는 계산되는 값이 채운다(§5.4).
// 주석은 뺀다 — 이 파일의 주석은 "왜 적중률을 안 거는가"를 길게 설명하고, 그 설명 자체를
// 위반으로 세면 근거를 적을수록 빨개진다(설명을 지우게 만드는 관문은 관문이 아니다).
function codeOnly(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'\\])\/\/[^\n]*/gm, (m, p) => p);
}
test("R3 — 편집기에 적중률 약속이 없다", () => {
  const code = codeOnly(XP);
  assert.ok(code.indexOf("적중") < 0, "편집기가 적중률을 말한다 — 측정한 적 없는 값이다");
  assert.ok(!/\d{1,3}\s*%/.test(code), "편집기 코드에 퍼센트 리터럴이 있다");
});

test("R3 — 조절판에도 적중률이 없고, 대신 계산되는 값이 온다", () => {
  const block = codeOnly(REPORT.slice(REPORT.indexOf("function buildWeights()"),
                                      REPORT.indexOf("function buildReadingsLink")));
  assert.ok(block.indexOf("적중") < 0, "조절판이 적중률을 말한다");
  assert.match(block, /rpTunedA|rpDeepWidth/, "계산되는 값(조정 개수·폭 변화)이 없다 — 자리가 비었다면 그것도 답이지만, 지금은 둘 다 없다");
});

// §5.4 — 심화를 안 거쳤으면 폭 비교를 지어내지 않는다(8a G1 과 같은 태도).
test("심화 결과가 없으면 폭 비교를 만들지 않는다", () => {
  const block = REPORT.slice(REPORT.indexOf("function buildWeights()"),
                             REPORT.indexOf("function buildReadingsLink"));
  assert.match(block, /if \(fullRec && fullRec\.an/, "심화 레코드 존재를 안 보고 비교를 그린다");
});

// 시안 10a 의 UX 규칙 둘 — 둘 다 "안 지키면 조절이 물리적으로 불가능해지는" 종류다.
test("슬라이더는 이름 아래 줄이다 — 한 줄이면 트랙이 150px 로 줄어 0.1 단위가 안 잡힌다", () => {
  // 선언 위치가 아니라 **어디에 붙는가**를 본다. 변이 검증에서 line1.appendChild(sl) 로
  // 바꿔도 초록이 나오는 걸 봤다 — 선언 순서는 붙는 자리와 무관하다.
  assert.match(XP, /row\.appendChild\(sl\);/, "슬라이더를 행에 안 붙인다");
  assert.ok(XP.indexOf("line1.appendChild(sl)") < 0,
    "슬라이더를 이름 줄(line1)에 붙인다 — 트랙이 이름·값과 폭을 나눠 0.1 단위가 안 잡힌다");
  const CSS = readFileSync(new URL("../www/style.css", import.meta.url), "utf8");
  assert.match(CSS, /\.xp-slider \{[^}]*display:block;[^}]*width:100%/,
    "슬라이더가 블록·전폭이 아니다 — 이름 옆에 끼면 트랙이 짧아진다");
});

test("값은 항상 숫자로 병기된다 — 슬라이더만 두면 뭘 골랐는지 모른다", () => {
  assert.match(XP, /function fmtW\(m\) \{ return m\.toFixed\(1\) \+ "×"; \}/, "배율 표기 함수가 없다");
  assert.match(XP, /MSUi\.el\("span", "xp-val"/, "행에 값 칸이 없다");
});

test("Lv1 핵심 5종에는 체크박스를 그리지 않는다 — 못 끄는 체크박스는 고장으로 보인다", () => {
  assert.match(XP, /var core = \(t\.lv === 1\);/, "Lv1 을 구분하지 않는다");
  assert.match(XP, /if \(!core\) \{\s*\n\s*var cb =/, "핵심 지표에도 체크박스를 그린다");
});

test("범위는 엔진·그래프 모듈에서 온다 — 화면이 0.1~3.0 을 다시 적지 않는다", () => {
  assert.match(XP, /MSGraph\.W_MIN/, "최소 배율을 화면이 따로 적는다");
  assert.match(XP, /MSGraph\.W_MAX/, "최대 배율을 화면이 따로 적는다");
  assert.match(XP, /MSGraph\.clampW\(/, "화면이 클램프를 자체 구현한다 — 엔진 한계와 갈릴 수 있다");
});

// 잔량을 **모르는 것**과 **모자란 것**은 다르다(P1 tier-sheet 의 같은 판단).
test("잔량을 모르면 막지 않는다 — 근거 없이 막으면 사용자가 이유를 알 수 없다", () => {
  assert.match(XP, /o\.balance != null && o\.cost != null && o\.balance < o\.cost/,
    "null 잔량을 0 처럼 다뤄 실행을 막는다");
});

test("단계 선택 시트에서 전문분석이 열렸다 — 잠금 표시가 아니라 값이 붙는다", () => {
  assert.match(SHEET, /tierRow\("custom",[\s\S]{0,200}cost: MSWallet\.COSTS\.custom/,
    "전문 행에 값이 없다 — 아직 잠겨 있다");
  assert.ok(SHEET.indexOf("locked: true") < 0, "잠금 분기가 남아 있다");
  assert.ok(!S.t.tsSoon, "잠금 문구가 남아 있다 — 안 쓰는 문구는 지운다");
});

test("전문 실행은 시트가 아니라 편집기를 연다 — '얼마나 정밀하게'와 '어떤 지표를 얼마나'는 다른 질문이다", () => {
  assert.match(REPORT, /if \(picked === "custom"\) runCustom\(\); else runFull\(\);/,
    "시트가 고른 등급을 안 본다");
  assert.match(REPORT, /MSExpert\.open\(\{/, "편집기를 열지 않는다");
});

test("프리셋 이름 넷이 화면 문구가 아니라 등급표에서 온다", () => {
  assert.match(XP, /MSIndTiers\.PRESETS\.forEach/, "프리셋을 화면이 다시 나열한다");
  T.PRESETS.forEach(p => assert.ok(XP.indexOf('"' + p.name + '"') < 0,
    "프리셋 이름이 화면에 리터럴로 박혀 있다: " + p.name));
});
