import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

// ⚠ 소스 문자열 검사다(readings.test.mjs 의 report.js 검사와 같은 이유 — report.js·watchlist.js·
// tier-sheet.js·screens/wallet.js 에 DOM 하네스가 없다). 초록이라고 화면이 옳다는 뜻이 아니라
// "호출 모양"만 본다. 리뷰 라운드 1의 I-H(이중 과금 방지 idem 재사용)·I-I(오프라인 잔량 안내)를
// 위한 소스 계약을 못박는다 — 둘 다 회귀해도 wallet-http.test.mjs 는 못 잡는 자리다(그쪽은
// 어댑터 단위이고, 이건 화면이 그 어댑터를 어떻게 쓰는지다).

const require = createRequire(import.meta.url);
const MSWallet = require("../www/wallet.js");
const REPORT = readFileSync(new URL("../www/screens/report.js", import.meta.url), "utf8");
const WATCHLIST = readFileSync(new URL("../www/screens/watchlist.js", import.meta.url), "utf8");
const TIER = readFileSync(new URL("../www/tier-sheet.js", import.meta.url), "utf8");
const WALLET_SCR = readFileSync(new URL("../www/screens/wallet.js", import.meta.url), "utf8");

// ── I-H: maybeCharged 분류기 자체는 wallet.test.mjs 가 이미 본다. 여기서는 report.js·
// watchlist.js 가 실제로 그 분류를 idem 재사용에 쓰는지를 소스 모양으로 확인한다.

test("wallet.js — maybeCharged 가 network·server-error·busy 만 재시도-안전으로 분류한다", () => {
  assert.strictEqual(MSWallet.maybeCharged("network"), true);
  assert.strictEqual(MSWallet.maybeCharged("server-error"), true);
  assert.strictEqual(MSWallet.maybeCharged("busy"), true);
  ["insufficient", "bad-idem", "bad-ref", "unauthorized", "unknown-runtype",
   "backend-error", "no-backend", undefined, null, ""].forEach(function (r) {
    assert.strictEqual(MSWallet.maybeCharged(r), false, "definitely-not-charged 사유가 재시도-안전으로 잘못 분류됐다: " + r);
  });
});

test("report.js 소스 모양 — purchaseFull 이 이전 시도의 idem 을 재사용한다(새로 뽑지 않는다)", () => {
  // 이전 rec.idem 이 있으면 그걸 쓰고, 그 다음은 저장소에 남은 값(지난 실행의 미확인 시도),
  // 둘 다 없을 때만 새로 뽑는다. "항상 새로 뽑는다"(구버전)로 되돌아가면 maybe-charged
  // 재시도가 원장에서 별개 키가 되어 이중 차감된다.
  assert.match(REPORT, /var idem = \(rec && rec\.idem\) \? rec\.idem : \(pendingFullIdem\(sym\) \|\| MSWallet\.newIdem\(\)\);/,
    "purchaseFull 이 무조건 새 idem 을 뽑는다 — maybe-charged 재시도가 이중 차감될 수 있다");
});

// 최종 리뷰(LIVE A): idem 재사용 장치가 전부 모듈 스코프 변수라 프로세스와 함께 죽었다.
// 응답 유실 → 강제 종료 → 재실행이 정확히 이 장치가 막으려던 시나리오인데, 그때만 사라졌다.
test("report.js 소스 모양 — 진행 중 idem 이 저장소에 남는다(실행보다 오래 산다)", () => {
  assert.match(REPORT, /var K_PEND_FULL = "ms_pending_full_idem";/, "종목별 미확인 idem 저장 키가 없다");
  assert.match(REPORT, /MSStore\.read0\(K_PEND_FULL/, "저장된 idem 을 읽지 않는다");
  assert.match(REPORT, /MSStore\.write0\(K_PEND_FULL/, "idem 을 저장하지 않는다 — 강제 종료로 사라진다");
  // 순서가 핵심이다: spend 를 "보내기 전에" 적어야 응답 유실 창이 덮인다.
  const write = REPORT.indexOf("setPendingFullIdem(sym, idem);");
  const send = REPORT.indexOf('MSWallet.spend("full"');
  assert.ok(write > 0 && send > 0 && write < send,
    "spend 를 보낸 뒤에 idem 을 적는다 — 이중 과금이 나는 창(요청은 나갔고 응답은 못 받은 구간)이 그대로 열려 있다");
});

test("report.js 소스 모양 — 확정 결과에서만 저장된 idem 을 지운다", () => {
  assert.match(REPORT, /rec\.runs = r\.runs;\s*\n\s*setPendingFullIdem\(sym, null\);/,
    "성공했는데 idem 이 남는다 — 다음 구매가 남의 키를 재사용해 재생(무과금)으로 흡수된다");
  assert.match(REPORT, /delete purchases\[sym\];[\s\S]{0,120}setPendingFullIdem\(sym, null\);/,
    "확정 실패·환급인데 저장된 idem 을 안 지운다");
});

// 최종 리뷰(MINOR): 세 번째 인자 sym 을 빼도 761/761 초록이었다 — 그런데 서버는 full·custom 에
// ref 가 없으면 bad-ref 로 거절한다(w_spend). 즉 프로덕션에서 Full 을 아무도 못 산다.
test("report.js 소스 모양 — Full 구매가 ref 로 종목을 함께 보낸다", () => {
  assert.match(REPORT, /MSWallet\.spend\("full", idem, sym\)/,
    "ref(sym) 없이 full 을 결제한다 — 서버가 bad-ref 로 전부 거절해 Full 을 살 수 없다");
});

test("report.js 소스 모양 — maybe-charged 실패는 idem 을 지우지 않는다(definitely-not-charged 만 지운다)", () => {
  assert.match(REPORT,
    /r\.kind === "unknown" \|\| \(r\.kind === "spend-fail" && MSWallet\.maybeCharged\(r\.reason\)\)/,
    "spend-fail 의 maybeCharged 분기가 없다 — 모든 실패가 무조건 idem 을 지우는 옛 동작으로 보인다");
});

test("report.js 소스 모양 — spend 실패 안내 문구도 maybeCharged 로 갈린다", () => {
  assert.match(REPORT, /MSWallet\.maybeCharged\(r\.reason\) \? MSStr\.t\.tsSpendFailedUnknown/,
    "'Nothing was charged' 문구를 maybe-charged 에도 그대로 쓰면 거짓말이 될 수 있다");
});

test("watchlist.js 소스 모양 — beginScan 이 pendingScanIdem 을 재사용하고, 확정 실패에만 비운다", () => {
  assert.match(WATCHLIST, /var idem = pendingScanIdem\(\) \|\| MSWallet\.newIdem\(\);/,
    "beginScan 이 이전 실패의 idem 을 재사용하지 않는다");
  assert.match(WATCHLIST, /if \(!MSWallet\.maybeCharged\(sp\.reason\)\) setPendingScanIdem\(null\);/,
    "maybe-charged 실패인데 idem 을 보존하지 않는다 — 재시도가 새 idem 을 써 이중 차감될 수 있다");
});

// 최종 리뷰(LIVE A): scan 은 w_entitled_types() 에 없어 서버 권리(spend-cached)라는 뒷받침이
// 없다 — 재시도가 새 키면 2 스쿱이 그냥 두 번 나간다. 그런데 그 키가 모듈 변수였다:
// 응답 유실 → 강제 종료 → 재실행이라는, 이 장치가 존재하는 이유 그 자체인 경로에서만 사라졌다.
test("watchlist.js 소스 모양 — 진행 중 스캔 idem 이 저장소에 남는다(실행보다 오래 산다)", () => {
  assert.match(WATCHLIST, /var K_PEND_SCAN = "ms_pending_scan_idem";/, "미확인 스캔 idem 저장 키가 없다");
  assert.match(WATCHLIST, /MSStore\.read0\(K_PEND_SCAN/, "저장된 idem 을 읽지 않는다");
  assert.match(WATCHLIST, /MSStore\.write0\(K_PEND_SCAN/, "idem 을 저장하지 않는다 — 강제 종료로 사라진다");
  const write = WATCHLIST.indexOf("setPendingScanIdem(idem);");
  const send = WATCHLIST.indexOf('MSWallet.spend("scan"');
  assert.ok(write > 0 && send > 0 && write < send,
    "spend 를 보낸 뒤에 idem 을 적는다 — 이중 과금이 나는 창이 그대로 열려 있다");
  assert.match(WATCHLIST, /setPendingScanIdem\(null\);\s*\/\/ 확정 성공/,
    "확정 성공인데 저장된 idem 을 안 지운다 — 다음 스캔이 그 키를 물려받아 재생(무과금)으로 흡수된다");
});

// ── I-I: 잔량을 못 읽었을 때(오프라인 등) 0 으로 그리지 않고, 실행 버튼을 막는다.

test("tier-sheet.js 소스 모양 — 잔량을 모르면(bal==null) Run 버튼을 막는다", () => {
  assert.match(TIER, /var unavailable = \(bal == null\);/, "bal==null 판정이 없다");
  assert.match(TIER, /run\.disabled = short \|\| unavailable;/,
    "run.disabled 가 unavailable 을 안 본다 — 잔량 불명인데 버튼이 활성으로 남을 수 있다(옛 버그)");
});

test("screens/wallet.js 소스 모양 — get() 이 실패하면(잔량 불명) 안내 메시지를 그린다(0으로 그리지 않는다)", () => {
  assert.match(WALLET_SCR, /draw\(r\.state,\s*\(!r\.ok \|\| !r\.state\) \? MSStr\.t\.walUnavailable : ""\);/,
    "MSWallet.get() 실패 시 안내 없이 빈 게이지(=0처럼 보임)를 그린다");
});

// ── strings.js — 새 문구가 실제로 있고 비어 있지 않은지(오탈자로 undefined 를 그리면 화면에
// "undefined" 문자열이 노출된다).

test("strings.js — I-I/I-H 에서 쓰는 새 문구가 모두 채워져 있다", () => {
  const MSStr = require("../www/strings.js");
  ["walUnavailable", "tsUnavailable", "tsSpendFailedUnknown"].forEach(function (k) {
    assert.strictEqual(typeof MSStr.t[k], "string", k + " 가 문자열이 아니다(누락되면 화면에 'undefined' 가 뜬다)");
    assert.ok(MSStr.t[k].length > 0, k + " 가 빈 문자열이다");
  });
});
