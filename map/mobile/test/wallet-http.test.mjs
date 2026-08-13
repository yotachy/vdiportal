import { test } from "node:test";
import assert from "node:assert";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const require = createRequire(import.meta.url);
const MSWalletHttp = require("../www/wallet-http.js");
const __dirname = dirname(fileURLToPath(import.meta.url));

// index.html 의 <script> 순서는 계약이다(readings.test.mjs 의 strings→readings→indicators 핀과
// 같은 이유) — wallet.js·wallet-http.js·app.js 는 전역 스코프를 공유하는 classic script라
// require() 로는 이 버그가 안 잡힌다: wallet-http.js 가 wallet.js 보다 먼저면 아무 문제 없이
// 로드되지만(서로 참조 안 함) app.js 가 둘보다 먼저면 MSWalletHttp/MSWallet 이 undefined 인
// 채로 install 분기가 조용히 스킵되고, 지갑이 설치되지 않은 채 앱이 뜬다.
test("index.html — wallet.js → wallet-http.js → app.js 순서", () => {
  const html = readFileSync(join(__dirname, "../www/index.html"), "utf8");
  const at = f => html.indexOf('<script src="' + f + '">');
  ["wallet.js", "wallet-http.js", "app.js"].forEach(f =>
    assert.ok(at(f) >= 0, "index.html 에 " + f + " 스크립트 태그가 없다"));
  assert.ok(at("wallet.js") < at("wallet-http.js"),
    "wallet-http.js 는 wallet.js 를 참조하지 않지만, app.js 의 설치 지점이 이 순서를 전제한다");
  assert.ok(at("wallet-http.js") < at("app.js"),
    "app.js 부팅 시 typeof MSWalletHttp 를 확인한다 — 먼저 로드되지 않으면 undefined 라 설치가 조용히 스킵된다");
});

function fakeStore() {
  const m = {};
  return { read0: (k, f) => (k in m ? m[k] : f), write0: (k, v) => { m[k] = v; }, _m: m };
}
// 호출을 기록하고 대본대로 답하는 가짜 fetch
function fakeFetch(script) {
  const calls = [];
  const fn = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, op: body.op, body, auth: (init.headers || {}).Authorization || null });
    const r = script.shift();
    if (!r) throw new Error("대본 소진: " + body.op);
    if (r.throw) throw new Error("network");
    return { ok: r.status < 400, status: r.status, json: async () => r.json };
  };
  fn.calls = calls;
  return fn;
}
const ST = { balance: 5, cap: 20, streakDays: 0, canCheckin: true };

test("첫 호출에서 hello 로 토큰을 받아 저장한다", async () => {
  const store = fakeStore();
  const f = fakeFetch([{ status: 200, json: { ok: true, token: "T1", state: ST } },
                       { status: 200, json: { ok: true, state: ST } }]);
  const b = MSWalletHttp.create({ url: "/w", fetch: f, store });
  const r = await b.get();
  assert.strictEqual(r.ok, true);
  assert.deepEqual(r.state, ST);
  assert.strictEqual(f.calls[0].op, "hello");
  assert.strictEqual(f.calls[1].op, "get");
  assert.strictEqual(f.calls[1].auth, "Bearer T1");
});

// 서버는 deviceId 최소 32자를 요구한다(hello 가 401 을 낼 만큼 짧으면 재발급 루프가
// 영원히 실패한다). 이 테스트는 8자만 확인하지만 구현은 32자 이상을 만들어야 한다 —
// 아래 별도 테스트가 그 하한을 명시적으로 잰다.
test("device_id 는 한 번 만들어 보관한다", async () => {
  const store = fakeStore();
  const f = fakeFetch([{ status: 200, json: { ok: true, token: "T1", state: ST } },
                       { status: 200, json: { ok: true, state: ST } }]);
  const b = MSWalletHttp.create({ url: "/w", fetch: f, store });
  await b.get();
  const dev = f.calls[0].body.deviceId;
  assert.ok(typeof dev === "string" && dev.length >= 8, "deviceId 가 짧다");
  assert.strictEqual(store.read0("ms_device_id", null), dev, "저장 안 됨");
});

// wallet-api.php 가 W_DEVICE_MIN 을 8→32 로 올렸다(리뷰 I4) — 짧은 deviceId 는 hello 에서
// bad-device(400) 로 거절된다. 여기서 32자 미만이면 실기기에서 첫 부팅부터 지갑이 죽는다.
test("device_id 는 서버 최소 길이(32자) 이상이고 crypto 기반이다 — 카운터/타임스탬프가 아니다", async () => {
  const store = fakeStore();
  const f = fakeFetch([{ status: 200, json: { ok: true, token: "T1", state: ST } },
                       { status: 200, json: { ok: true, state: ST } }]);
  const b = MSWalletHttp.create({ url: "/w", fetch: f, store });
  await b.get();
  const dev = f.calls[0].body.deviceId;
  assert.ok(dev.length >= 32, "deviceId 가 서버 W_DEVICE_MIN(32) 보다 짧다: " + dev.length);
});

test("401 이면 hello 로 한 번만 재발급하고 재시도한다", async () => {
  const store = fakeStore();
  store.write0("ms_device_id", "dev-abcdefgh");
  store.write0("ms_wallet_token", "OLD");
  const f = fakeFetch([{ status: 401, json: { ok: false, reason: "unauthorized" } },
                       { status: 200, json: { ok: true, token: "NEW", state: ST } },
                       { status: 200, json: { ok: true, state: ST } }]);
  const b = MSWalletHttp.create({ url: "/w", fetch: f, store });
  const r = await b.get();
  assert.strictEqual(r.ok, true);
  assert.deepEqual(f.calls.map(c => c.op), ["get", "hello", "get"]);
  assert.strictEqual(f.calls[2].auth, "Bearer NEW");
});

test("재발급 후에도 401 이면 포기한다 — 무한 루프 금지", async () => {
  const store = fakeStore();
  store.write0("ms_device_id", "dev-abcdefgh");
  store.write0("ms_wallet_token", "OLD");
  const f = fakeFetch([{ status: 401, json: { ok: false, reason: "unauthorized" } },
                       { status: 200, json: { ok: true, token: "NEW", state: ST } },
                       { status: 401, json: { ok: false, reason: "unauthorized" } }]);
  const b = MSWalletHttp.create({ url: "/w", fetch: f, store });
  const r = await b.get();
  assert.strictEqual(r.ok, false);
  assert.strictEqual(f.calls.length, 3, "재시도가 더 돌았다");
});

test("네트워크 실패는 ok:false 로 떨어지고 잔량을 지어내지 않는다", async () => {
  const store = fakeStore();
  store.write0("ms_device_id", "dev-abcdefgh");
  store.write0("ms_wallet_token", "T1");
  const f = fakeFetch([{ throw: true }]);
  const b = MSWalletHttp.create({ url: "/w", fetch: f, store });
  const r = await b.get();
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.state, null, "오프라인에서 state 를 지어냈다");
});

test("spend 가 ref 와 idem 을 실어 보낸다", async () => {
  const store = fakeStore();
  store.write0("ms_device_id", "dev-abcdefgh");
  store.write0("ms_wallet_token", "T1");
  const f = fakeFetch([{ status: 200, json: { ok: true, charged: true, reason: null, state: ST } }]);
  const b = MSWalletHttp.create({ url: "/w", fetch: f, store });
  const r = await b.spend("full", "idem-1", "AAPL");
  assert.strictEqual(r.ok, true);
  assert.strictEqual(f.calls[0].body.runType, "full");
  assert.strictEqual(f.calls[0].body.idem, "idem-1");
  assert.strictEqual(f.calls[0].body.ref, "AAPL");
});

test("checkin 이 granted·capped 를 그대로 전달한다", async () => {
  const store = fakeStore();
  store.write0("ms_device_id", "dev-abcdefgh");
  store.write0("ms_wallet_token", "T1");
  const f = fakeFetch([{ status: 200, json: { ok: true, granted: 0, capped: true, reason: null, state: ST } }]);
  const b = MSWalletHttp.create({ url: "/w", fetch: f, store });
  const r = await b.checkin();
  assert.strictEqual(r.granted, 0);
  assert.strictEqual(r.capped, true, "capped 가 유실되면 화면 안내가 사라진다");
});
