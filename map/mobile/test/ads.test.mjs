import { test } from "node:test";
import assert from "node:assert";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const require = createRequire(import.meta.url);
const MSAds = require("../www/ads.js");
const __dirname = dirname(fileURLToPath(import.meta.url));

// 가짜 AdMob 플러그인. 호출 순서를 기록한다 — 이 스위트가 보는 것의 절반은 "무엇을 불렀나"가
// 아니라 "어떤 순서로 불렀나"다. 동의가 광고보다 늦으면 그 자체로 정책 위반이라, 둘 다
// 불렸다는 사실만 확인하는 테스트는 위반을 통과시킨다.
function fakePlugin(opts) {
  const o = opts || {};
  const seen = [];
  const p = {
    seen,
    prepared: [],
    initialize: () => { seen.push("init"); return o.initFail ? Promise.reject(new Error("init")) : Promise.resolve(); },
    requestConsentInfo: () => {
      seen.push("consent");
      if (o.consentFail) return Promise.reject(new Error("no network"));
      return Promise.resolve(o.info === undefined ? INFO_NOT_REQUIRED : o.info);
    },
    showConsentForm: () => { seen.push("form"); return o.formFail ? Promise.reject(new Error("form")) : Promise.resolve(o.formInfo || null); },
    showPrivacyOptionsForm: () => { seen.push("privacy"); return Promise.resolve(); },
    prepareRewardVideoAd: (a) => { seen.push("prepare"); p.prepared.push(a); return o.prepareFail ? Promise.reject(new Error("no fill")) : Promise.resolve({}); },
    showRewardVideoAd: () => { seen.push("show"); return Promise.resolve({ type: "coins", amount: 1 }); }
  };
  return p;
}

// wallet-api.php 의 adConfig 응답 모양. customData 는 계정 id 그대로(^[0-9a-f]{16}$)다.
const ACCT = "a1b2c3d4e5f60718";
const CFG = { ok: true, quick: { unitId: "unit-quick", reward: 1 }, full: { unitId: "unit-full", reward: 3 }, customData: ACCT };

const INFO_NOT_REQUIRED = { status: "NOT_REQUIRED", canRequestAds: true, privacyOptionsRequirementStatus: "NOT_REQUIRED" };
const INFO_REQUIRED = { status: "REQUIRED", isConsentFormAvailable: true, canRequestAds: false, privacyOptionsRequirementStatus: "REQUIRED" };
const INFO_OBTAINED = { status: "OBTAINED", isConsentFormAvailable: true, canRequestAds: true, privacyOptionsRequirementStatus: "REQUIRED" };

test("index.html — wallet-http.js → ads.js → app.js 순서", () => {
  const html = readFileSync(join(__dirname, "../www/index.html"), "utf8");
  const at = f => html.indexOf('<script src="' + f + '">');
  ["wallet-http.js", "ads.js", "app.js"].forEach(f =>
    assert.ok(at(f) >= 0, "index.html 에 " + f + " 스크립트 태그가 없다"));
  assert.ok(at("wallet-http.js") < at("ads.js"),
    "광고 설정은 지갑 백엔드(adConfig)에서 온다 — 지갑 어댑터가 먼저 로드돼야 한다");
  assert.ok(at("ads.js") < at("app.js"),
    "app.js 부팅 시 typeof MSAds 를 확인한다 — 먼저 로드되지 않으면 undefined 라 설치가 조용히 스킵된다");
});

// ── 규정 ①: 동의가 첫 광고 요청보다 먼저다 ────────────────────────────────────

test("동의 확인이 첫 광고 요청보다 먼저다", async () => {
  const p = fakePlugin();
  MSAds.install(p);
  await MSAds.init(CFG);
  await MSAds.show("quick");
  assert.ok(p.seen.indexOf("consent") >= 0, "동의를 아예 확인하지 않았다");
  assert.ok(p.seen.indexOf("prepare") >= 0, "광고를 요청하지 않았다 — 순서 검사가 무의미해진다");
  assert.ok(p.seen.indexOf("consent") < p.seen.indexOf("prepare"),
    "동의 확인이 광고 요청보다 늦다: " + p.seen.join(","));
});

test("init 을 기다리지 않고 show 해도 동의가 먼저다", async () => {
  // 화면이 await 를 빠뜨리는 것은 흔한 실수다. 순서가 호출자 규율에 달려 있으면
  // 그 실수 하나가 정책 위반이 된다 — 파사드가 구조로 막아야 한다.
  const p = fakePlugin();
  MSAds.install(p);
  MSAds.init(CFG);            // 일부러 await 하지 않는다
  await MSAds.show("quick");
  assert.ok(p.seen.indexOf("consent") < p.seen.indexOf("prepare"),
    "init 을 기다리지 않았더니 광고가 동의를 앞질렀다: " + p.seen.join(","));
});

test("init 없이 show 하면 광고를 띄우지 않는다", async () => {
  const p = fakePlugin();
  MSAds.install(p);           // install 이 상태를 지운다 = init 을 거치지 않은 상태
  const r = await MSAds.show("quick");
  assert.strictEqual(r.shown, false);
  assert.strictEqual(p.seen.indexOf("prepare"), -1,
    "동의가 해소된 적 없는데 광고를 요청했다: " + p.seen.join(","));
});

// ── 규정 ②: canRequestAds 가 광고 요청의 관문이다 ─────────────────────────────

test("canRequestAds=false 면 광고를 요청하지 않는다", async () => {
  const p = fakePlugin({ info: INFO_REQUIRED });   // 동의 필요 · 아직 미동의
  MSAds.install(p);
  await MSAds.init(CFG);
  const r = await MSAds.show("quick");
  assert.strictEqual(r.shown, false);
  assert.strictEqual(r.reason, "consent-required");
  assert.strictEqual(p.seen.indexOf("prepare"), -1,
    "UMP 가 광고 요청 불가라고 했는데 요청했다 — EEA·영국·캐나다에서 출시할 수 없게 만드는 바로 그 위반이다: " + p.seen.join(","));
});

test("canRequestAds=true 면 광고를 요청한다", async () => {
  const p = fakePlugin({ info: INFO_OBTAINED });
  MSAds.install(p);
  await MSAds.init(CFG);
  const r = await MSAds.show("quick");
  assert.strictEqual(r.shown, true, "동의를 마친 사용자인데 광고가 막혔다");
});

test("동의 폼을 닫은 뒤 canRequestAds 를 다시 읽는다", async () => {
  // showConsentForm 은 void 가 아니라 갱신된 정보를 돌려준다. 다시 읽지 않으면
  // 방금 동의한 사용자가 예전 false 에 계속 막혀 광고를 영영 못 본다.
  const p = fakePlugin({ info: INFO_REQUIRED, formInfo: INFO_OBTAINED });
  MSAds.install(p);
  await MSAds.init(CFG);
  assert.strictEqual((await MSAds.show("quick")).reason, "consent-required");
  const okNow = await MSAds.showConsent();
  assert.strictEqual(okNow, true, "폼을 닫았는데도 광고 요청 불가로 남았다");
  const r = await MSAds.show("quick");
  assert.strictEqual(r.shown, true, "동의를 마쳤는데 광고가 여전히 막혔다");
});

// ── 폼 게이트: 이미 동의한 사용자에게 다시 묻지 않는다 ────────────────────────

test("이미 동의한(OBTAINED) 사용자에겐 동의 폼을 띄우지 않는다", async () => {
  // isConsentFormAvailable 만 보고 판단하면 이 사용자에게 앱을 열 때마다 동의창이 뜬다.
  const p = fakePlugin({ info: INFO_OBTAINED });   // 폼은 있지만 이미 동의했다
  MSAds.install(p);
  await MSAds.init(CFG);
  assert.strictEqual(await MSAds.consentNeeded(), false,
    "동의를 마친 사용자에게 동의 폼을 다시 띄우려 한다 — isConsentFormAvailable 만 보고 판단한 결과다");
});

test("status=REQUIRED 이고 폼이 있으면 동의 폼을 띄운다", async () => {
  MSAds.install(fakePlugin({ info: INFO_REQUIRED }));
  await MSAds.init(CFG);
  assert.strictEqual(await MSAds.consentNeeded(), true);
});

test("status=REQUIRED 라도 폼이 없으면 띄우지 않는다", async () => {
  MSAds.install(fakePlugin({ info: { status: "REQUIRED", canRequestAds: false, privacyOptionsRequirementStatus: "UNKNOWN" } }));
  await MSAds.init(CFG);
  assert.strictEqual(await MSAds.consentNeeded(), false,
    "isConsentFormAvailable 은 선택 필드다 — 없을 때 띄우려 하면 폼 없이 대기만 한다");
});

// ── 광고 설정 재진입 줄 ───────────────────────────────────────────────────────

test("privacyOptionsRequirementStatus=REQUIRED 일 때만 광고 설정 줄을 노출한다", async () => {
  MSAds.install(fakePlugin({ info: INFO_OBTAINED }));
  await MSAds.init(CFG);
  assert.strictEqual(await MSAds.privacyOptionsRequired(), true);

  MSAds.install(fakePlugin({ info: INFO_NOT_REQUIRED }));
  await MSAds.init(CFG);
  assert.strictEqual(await MSAds.privacyOptionsRequired(), false,
    "대상 지역이 아닌데 광고 설정 줄이 생긴다 — 폼 존재 여부로 대신 판단한 결과다");
});

test("광고 설정 폼을 닫으면 동의 정보를 다시 읽는다", async () => {
  // showPrivacyOptionsForm 은 void 다. 다시 읽지 않으면 사용자가 방금 동의를 철회한 것을
  // 우리가 모르고 계속 광고를 요청한다.
  const p = fakePlugin({ info: INFO_OBTAINED });
  MSAds.install(p);
  await MSAds.init(CFG);
  p.requestConsentInfo = () => { p.seen.push("consent"); return Promise.resolve({ status: "REQUIRED", canRequestAds: false, privacyOptionsRequirementStatus: "REQUIRED" }); };
  const can = await MSAds.showPrivacyOptions();
  assert.strictEqual(can, false, "철회했는데 여전히 광고 요청 가능으로 본다");
  assert.ok(p.seen.lastIndexOf("consent") > p.seen.indexOf("privacy"),
    "폼을 닫은 뒤 동의 정보를 다시 읽지 않았다: " + p.seen.join(","));
  assert.strictEqual((await MSAds.show("quick")).reason, "consent-required");
});

// ── 실패는 광고를 막지 않는다(대상 지역이 아닌 사용자까지 꺼뜨리는 쪽이 더 나쁘다) ──

test("동의 조회가 실패해도 광고를 막지 않는다", async () => {
  const p = fakePlugin({ consentFail: true });
  MSAds.install(p);
  await MSAds.init(CFG);
  const r = await MSAds.show("quick");
  assert.strictEqual(r.shown, true, "동의 조회 실패가 광고를 막았다 — 대상 지역이 아닌 사용자까지 막힌다");
  assert.ok(p.seen.indexOf("consent") < p.seen.indexOf("prepare"),
    "실패했더라도 시도는 광고보다 먼저여야 한다: " + p.seen.join(","));
});

test("광고 로드가 실패하면 shown=false 로 돌려준다(던지지 않는다)", async () => {
  MSAds.install(fakePlugin({ prepareFail: true }));
  await MSAds.init(CFG);
  const r = await MSAds.show("quick");
  assert.deepStrictEqual(r, { shown: false, reason: "failed" });
});

// ── SSV customData ────────────────────────────────────────────────────────────

test("customData 를 가공 없이 그대로 광고 요청에 싣는다", async () => {
  const p = fakePlugin();
  MSAds.install(p);
  await MSAds.init(CFG);
  await MSAds.show("full");
  assert.strictEqual(p.prepared.length, 1);
  assert.strictEqual(p.prepared[0].adId, "unit-full", "unit 이름이 유닛 ID 로 이어지지 않았다");
  assert.ok(p.prepared[0].ssv, "SSV 옵션 없이 광고를 요청했다 — 서버가 콜백에서 계정을 알 방법이 없다");
  assert.strictEqual(p.prepared[0].ssv.customData, ACCT,
    "customData 가 가공됐다 — wallet-ssv.php 는 ^[0-9a-f]{16}$ 가 아니면 콜백을 조용히 버린다(빈 200, 로그 없음)");
  // 모양 자체를 못 박는다. 감싸거나 조합한 값은 서버 정규식을 통과하지 못한다.
  assert.match(p.prepared[0].ssv.customData, /^[0-9a-f]{16}$/);
});

test("customData 가 없으면 광고를 띄우지 않는다", async () => {
  // 띄우면 사용자는 광고를 끝까지 보고 아무것도 못 받는다 — SSV 콜백이 계정을 못 찾아
  // 조용히 버려지기 때문이다. 안 띄우는 쪽이 낫다.
  const p = fakePlugin();
  MSAds.install(p);
  await MSAds.init({ ok: true, quick: { unitId: "unit-quick", reward: 1 } });
  const r = await MSAds.show("quick");
  assert.strictEqual(r.shown, false);
  assert.strictEqual(r.reason, "no-ssv");
  assert.strictEqual(p.seen.indexOf("prepare"), -1, "보상이 될 수 없는 광고를 띄웠다");
});

// ── 플러그인이 없는 환경(브라우저·테스트)에서 얌전히 죽는다 ───────────────────

test("플러그인이 없으면 available()=false 이고 show() 는 던지지 않는다", async () => {
  MSAds.install(null);
  assert.strictEqual(MSAds.available(), false);
  await MSAds.init(CFG);
  assert.strictEqual(MSAds.available(), false, "플러그인이 없는데 광고를 띄울 수 있다고 답한다");
  const r = await MSAds.show("quick");
  assert.deepStrictEqual(r, { shown: false, reason: "unavailable" });
  assert.strictEqual(await MSAds.consentNeeded(), false);
  assert.strictEqual(await MSAds.privacyOptionsRequired(), false);
  assert.strictEqual(await MSAds.showConsent(), true, "플러그인이 없는 환경에서 광고를 막을 이유가 없다");
});

test("설정이 없으면 available()=false", async () => {
  MSAds.install(fakePlugin());
  assert.strictEqual(MSAds.available(), false, "init 전인데 준비됐다고 답한다");
  await MSAds.init(CFG);
  assert.strictEqual(MSAds.available(), true);
});

test("모르는 unit 이름은 광고를 요청하지 않는다", async () => {
  const p = fakePlugin();
  MSAds.install(p);
  await MSAds.init(CFG);
  const r = await MSAds.show("nope");
  assert.deepStrictEqual(r, { shown: false, reason: "unavailable" });
  assert.strictEqual(p.seen.indexOf("prepare"), -1, "유닛 ID 없이 광고를 요청했다");
});

// ── www/ 는 ES5 다 ────────────────────────────────────────────────────────────

test("ads.js 는 ES5 문법만 쓴다", () => {
  const src = readFileSync(join(__dirname, "../www/ads.js"), "utf8");
  // 주석에는 화살표(→)나 예시가 들어갈 수 있으니 코드 줄만 본다.
  const code = src.split("\n").filter(l => !/^\s*\/\//.test(l)).join("\n");
  assert.strictEqual(/=>/.test(code), false, "화살표 함수가 있다");
  assert.strictEqual(/\b(const|let)\s/.test(code), false, "const/let 이 있다");
  assert.strictEqual(/`/.test(code), false, "템플릿 리터럴이 있다");
  assert.strictEqual(/\?\./.test(code), false, "옵셔널 체이닝이 있다");
  assert.strictEqual(/\.\.\./.test(code), false, "스프레드가 있다");
});
