// 앱의 고리(핸드오프 README §B). 이 관문이 지키는 것은 화면 하나가 아니라 **순환**이다:
//
//   심화분석을 본다 → 내일 확인할 결과가 예약된다 → 다음 날 판정된다
//   → 워치리스트 최상단에 뜬다 → 결과를 열면 오늘 판정으로 이어진다 ↺
//
// 이 고리가 없으면 앱은 "목록 → 리포트 한 방"이고, 광고 노출도 안 는다. 오래 "예측 기록
// 서버가 있어야 한다"는 이유로 미뤄뒀는데 서버는 동기화용이지 고리의 전제가 아니었다 —
// 그 오해가 개편 전체를 옛 구조에 묶어뒀다. 되돌아오지 못하게 여기서 잰다.
import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const P = require("../www/predictions.js");
const REPORT = readFileSync(new URL("../www/screens/report.js", import.meta.url), "utf8");
const WL = readFileSync(new URL("../www/screens/watchlist.js", import.meta.url), "utf8");
const RS = readFileSync(new URL("../www/screens/result.js", import.meta.url), "utf8");
const APP = readFileSync(new URL("../www/app.js", import.meta.url), "utf8");
const HTML = readFileSync(new URL("../www/index.html", import.meta.url), "utf8");
const S = require("../www/strings.js");

const strip = src => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

test("고리의 네 칸이 전부 존재한다 — 하나라도 없으면 순환이 끊긴다", () => {
  assert.match(strip(REPORT), /recordPrediction\(\)/, "① 예측을 적어두지 않는다");
  assert.match(strip(REPORT), /settlePending\(\)/, "② 새 봉이 와도 판정하지 않는다");
  assert.match(strip(WL), /(?<!function )buildResults\(\)/, "③ 결과가 워치리스트에 안 뜬다");
  assert.match(strip(APP), /"result"/, "④ 결과 상세로 갈 길이 없다");
  assert.match(HTML, /screens\/result\.js/, "결과 화면이 앱에 안 실렸다");
  assert.match(HTML, /predictions\.js/, "판정 규칙이 앱에 안 실렸다");
});

test("결과 카드가 목록보다 **위**다 — 앱을 여는 이유가 '어제 그거 맞았나'다", () => {
  const code = strip(WL);
  // 정의가 아니라 **부르는 자리**를 본다 — 정의는 파일 위쪽에 있어 언제나 앞선다.
  const call = code.match(/(?<!function )buildResults\(\)/);
  assert.ok(call, "결과 카드를 그리는 호출이 없다 — 카드가 화면에 안 붙는다");
  const res = call.index;
  const today = code.indexOf("MSStr.t.wlToday");
  assert.ok(res > 0 && today > 0, "두 자리를 못 찾았다");
  assert.ok(res < today,
    "결과 카드가 '오늘' 섹션보다 아래에 있다 — 시안 14a 의 핵심 배치가 뒤집혔다");
});

test("값을 치른 분석만 기록한다 — 화면을 연 횟수가 기록이 되면 안 된다", () => {
  // recordPrediction 은 구매 성공 경로에서만 불린다. 로드 성공(finishData)에서 부르면
  // 기본분석을 열 때마다 기록이 쌓이고, 적중률의 분모가 "본 횟수"가 된다.
  const code = strip(REPORT);
  // 정의(function recordPrediction())는 호출이 아니다 — 세는 것은 부르는 자리뿐이다.
  const calls = [...code.matchAll(/(?<!function )recordPrediction\(\)/g)].map(m => m.index);
  assert.equal(calls.length, 1, "기록을 부르는 자리가 하나가 아니다: " + calls.length);
  // 구매 성공 처리 블록 안에서만 불려야 한다 — 그 블록의 시작(r.kind === "success")과
  // 기록 호출 사이에 다른 분기 종료가 끼면 안 된다.
  const okAt = code.lastIndexOf('r.kind === "success"', calls[0]);
  assert.ok(okAt > 0 && calls[0] - okAt < 600,
    "기록이 구매 성공 경로 밖에서 불린다 — 무료 열람도 기록된다");
});

test("판정은 예약된 것만, 한 번만 — 오늘 데이터로 어제 말을 고치지 않는다", () => {
  const ST = require("../www/store.js");
  // settlePred 는 judgedOn 이 없는 건에만 쓴다.
  const src = strip(readFileSync(new URL("../www/store.js", import.meta.url), "utf8"));
  assert.match(src, /!r\.judgedOn/, "이미 판정된 기록을 다시 덮어쓸 수 있다");
  assert.equal(typeof ST.addPred, "function");
  assert.equal(typeof ST.settlePred, "function");
});

test("같은 종목·같은 기준일을 두 번 적지 않는다 — 분모가 조용히 부푼다", () => {
  const src = strip(readFileSync(new URL("../www/store.js", import.meta.url), "utf8"));
  assert.match(src, /list\[i\]\.sym === rec\.sym && list\[i\]\.asOf === rec\.asOf/,
    "중복 기록을 막는 자리가 없다");
});

test("빗나간 날에는 광고를 권하지 않는다 — 이 화면의 비대칭이 전부다", () => {
  const code = strip(RS);
  const hitAt = code.indexOf("rec.hit) {");
  assert.ok(hitAt > 0, "맞힘/빗나감 분기를 못 찾았다");
  const missBranch = code.slice(code.indexOf("} else {", hitAt));
  assert.ok(missBranch.indexOf("rsAdToday") < 0,
    "빗나간 가지에 광고 권유가 있다 — '틀려놓고 광고를 판다'가 된다");
  assert.ok(missBranch.indexOf("rsTryExpert") > 0,
    "빗나간 날에 줄 대안(전문분석)이 없다 — 막다른 골목이다");
});

test("퍼센트는 20건 이상부터만 — 그 전에는 왜 없는지 말한다", () => {
  assert.equal(P.MIN_N, 20);
  const code = strip(WL);
  assert.match(code, /MSPreds\.hitRate\(/, "적중률을 규칙 모듈에서 얻지 않는다");
  assert.match(code, /wlResSmall/, "20건 미만일 때 이유를 말하지 않는다");
  // 화면이 스스로 나눗셈을 하면 그 문턱을 우회하게 된다.
  assert.ok(code.indexOf("/ all.length") < 0 && code.indexOf("/ done.length") < 0,
    "화면이 적중률을 직접 계산한다 — 20건 문턱을 우회할 수 있다");
});

test("결과가 없으면 카드를 아예 그리지 않는다 — 빈 껍데기는 로딩 실패로 읽힌다", () => {
  const code = strip(WL);
  const at = code.indexOf("function buildResults");
  const body = code.slice(at, at + 700);
  assert.match(body, /if \(!recent\.length\) return null/,
    "판정된 결과가 없어도 카드를 그린다");
});

test("결과 화면은 기록된 값으로만 말한다 — 엔진을 다시 돌리지 않는다", () => {
  const code = strip(RS);
  assert.ok(code.indexOf("ForgeCore") < 0,
    "결과 화면이 엔진을 부른다 — 오늘 데이터로 어제 말을 다시 만들게 된다");
});

test("결과 문구가 전부 strings.js 에 있다", () => {
  const used = [...new Set([...strip(RS).matchAll(/MSStr\.t\.([A-Za-z0-9_]+)/g)].map(m => m[1]))];
  assert.ok(used.length >= 10, "결과 화면이 읽는 키를 못 찾았다: " + used.length);
  used.forEach(k => assert.ok(typeof S.t[k] === "string", k + " 가 strings.js 에 없다"));
});

// ── 고리에 매달린 가지들 ─────────────────────────────────────────────────────────
const SR = readFileSync(new URL("../www/screens/scan-result.js", import.meta.url), "utf8");
const RC = readFileSync(new URL("../www/screens/record.js", import.meta.url), "utf8");

test("스캔은 '무엇이 달라졌는지'까지만 말한다 — '왜'는 유료 분석의 몫이다", () => {
  const code = strip(SR);
  // 스캔 결과 화면이 엔진을 부르거나 판독문을 그리면 경계를 넘은 것이다.
  // 그 순간 스캔이 심화분석을 대신하게 되고, 팔 것이 없어진다(시안 15c 경계 규칙).
  assert.ok(code.indexOf("ForgeCore") < 0, "스캔 결과가 엔진을 부른다");
  assert.ok(code.indexOf("MSIndicators") < 0, "스캔 결과가 지표 판독을 그린다");
  assert.ok(code.indexOf("MSReadings") < 0, "스캔 결과가 판독문을 그린다");
  assert.match(code, /srBoundary/, "경계를 사용자에게 말하지 않는다");
});

test("뒤집힘이 없으면 스캔 결과로 데려가지 않는다 — 방해가 된다", () => {
  const code = strip(WL);
  const at = code.indexOf('MSApp.go("scanresult")');
  assert.ok(at > 0, "스캔이 끝나도 결과 화면으로 갈 길이 없다");
  const before = code.slice(Math.max(0, at - 400), at);
  assert.match(before, /flips\.length/, "뒤집힘 여부를 보지 않고 이동한다");
});

test("스캔이 뒤집힘을 알려면 직전 방향을 덮어쓰기 전에 읽어야 한다", () => {
  const code = strip(WL);
  const at = code.indexOf("function analyzeAndPersist");
  const body = code.slice(at, at + 600);
  const readAt = body.indexOf("MSStore.getScan(sym)");
  const writeAt = body.indexOf("MSStore.setScan(sym");
  assert.ok(readAt > 0 && writeAt > 0, "읽기/쓰기 자리를 못 찾았다");
  assert.ok(readAt < writeAt, "덮어쓴 뒤에 직전 방향을 읽는다 — 뒤집힘을 영영 못 본다");
});

test("기록 화면은 오답을 숨기지 않는다 — 빗나간 필터가 기본 탭 바로 옆이다", () => {
  const code = strip(RC);
  const keys = [...code.matchAll(/key: "(\w+)"/g)].map(m => m[1]);
  assert.deepEqual(keys.slice(0, 2), ["all", "miss"],
    "빗나간 기록 필터가 두 번째가 아니다 — 찾아 들어가야 보이면 숨긴 것이다: " + keys.join(","));
});

test("기록 화면도 20건 문턱을 스스로 우회하지 않는다", () => {
  const code = strip(RC);
  assert.match(code, /MSPreds\.hitRate\(/, "적중률을 규칙 모듈에서 얻지 않는다");
  assert.ok(code.indexOf("/ all.length") < 0, "화면이 적중률을 직접 계산한다");
  assert.match(code, /rcTooFew/, "20건 미만일 때 왜 없는지 말하지 않는다");
});

test("결과 카드에서 전체 기록으로 가는 길이 있다", () => {
  assert.match(strip(WL), /MSApp\.go\("record"\)/,
    "3건 말고 나머지 기록을 볼 길이 없다 — 쌓이는 걸 못 보면 20건을 채울 이유도 없다");
});
