import { test } from "node:test";
import assert from "node:assert";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const require = createRequire(import.meta.url);
const MSWalletHttp = require("../www/wallet-http.js");
const __dirname = dirname(fileURLToPath(import.meta.url));

function fakeStore() {
  const m = {};
  return { read0: (k, f) => (k in m ? m[k] : f), write0: (k, v) => { m[k] = v; }, _m: m };
}
// 호출을 기록하고 대본대로 답하는 가짜 fetch. method·Content-Type 까지 잡아둔다(I-G) —
// 요청 모양이 바뀌어도(GET 으로 새거나 헤더가 빠져도) 그동안 아무 테스트도 못 잡았다.
function fakeFetch(script) {
  const calls = [];
  const fn = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({
      url, op: body.op, body,
      method: init.method,
      contentType: (init.headers || {})["Content-Type"],
      auth: (init.headers || {}).Authorization || null
    });
    const r = script.shift();
    if (!r) throw new Error("대본 소진: " + body.op);
    if (r.throw) throw new Error("network");
    return { ok: r.status < 400, status: r.status, json: async () => r.json };
  };
  fn.calls = calls;
  return fn;
}
const ST = { balance: 5, cap: 20, streakDays: 0, canCheckin: true };
// wallet-api.php 의 W_DEVICE_MIN=32 를 만족하는 유효한 기존 deviceId 픽스처. 예전엔
// "dev-abcdefgh"(12자)를 썼는데 실제 서버라면 이 값 자체가 매 hello 마다 400 bad-device 로
// 거절되는 값이라 "이미 등록된 기기" 시나리오를 대표하지 못했다(리뷰 지적, I-E).
const DEV32 = "d".repeat(40);

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

// C1: app.js 가 상대경로 "wallet-api.php" 로 설치하면 capacitor.config.json 의
// androidScheme:"https" 때문에 앱은 https://localhost/ 에서 서빙되고, 그 상대경로는 번들에
// 없는 파일을 가리켜 get/spend/refund/checkin 전부가 조용히 404 로 죽는다 — 리뷰 라운드 1의
// Critical 이었는데, 어댑터 자체는 opts.url 을 그대로 받아 쓸 뿐이라 wallet-http.test.mjs 의
// 다른 테스트는 이 값을 전혀 안 본다(759건 전부 통과한 채로 이 버그가 살아 있었다). 설치
// 지점(app.js)을 직접 읽어 절대 URL 인지, api.js 와 같은 오리진/디렉터리인지 확인한다 —
// 기대값을 리터럴로 두 번 쓰지 않고 api.js 의 API_BASE 에서 유도한다: 둘이 갈리면(예: 한쪽만
// 도메인을 옮기는 배포 실수) 이 테스트가 그 사실 자체를 말해야 한다.
test("app.js — 지갑 설치 URL이 절대경로이고 api.js 와 같은 오리진·디렉터리다", () => {
  const APP = readFileSync(join(__dirname, "../www/app.js"), "utf8");
  const API = readFileSync(join(__dirname, "../www/api.js"), "utf8");

  const appMatch = APP.match(/MSWalletHttp\.create\(\{\s*url:\s*"([^"]+)"/);
  assert.ok(appMatch, "app.js 에서 MSWalletHttp.create({ url: \"...\" }) 를 못 찾았다");
  const walletUrl = appMatch[1];
  assert.match(walletUrl, /^https:\/\//,
    "상대경로다 — androidScheme:\"https\" 앱에서 https://localhost/... 로 풀려 번들에 없는 파일을 가리킨다(C1)");

  const apiMatch = API.match(/API_BASE\s*=\s*"([^"]+)"/);
  assert.ok(apiMatch, "api.js 에서 API_BASE 를 못 찾았다 — 기대값을 유도할 기준이 없다");
  const apiDir = apiMatch[1].replace(/[^/]+$/, "");   // ".../map/forge-api.php" → ".../map/"
  assert.strictEqual(walletUrl.indexOf(apiDir), 0,
    "지갑 URL 의 오리진·디렉터리가 api.js 와 다르다: " + walletUrl + " vs " + apiDir);
  assert.strictEqual(walletUrl, apiDir + "wallet-api.php",
    "같은 디렉터리의 wallet-api.php 를 가리켜야 한다");
});

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

// I-A ①: 이름이 "crypto 기반이다"라고 주장하면 실제로 crypto.getRandomValues 가 준 바이트에서
// deviceId 가 나오는지 증명해야 한다. 길이만 재는 이전 테스트는 Date.now()+Math.random() 폴백도
// (길이를 32자 이상으로 늘려두기만 하면) 통과시켜 이름과 내용이 어긋났다(리뷰 지적).
test("device_id — crypto.getRandomValues 가 준 바이트를 그대로 hex 로 인코딩한다", async () => {
  const store = fakeStore();
  const orig = globalThis.crypto.getRandomValues;
  let capturedLen = null;
  globalThis.crypto.getRandomValues = (arr) => {
    for (let i = 0; i < arr.length; i++) arr[i] = i;   // 결정적 바이트: 0,1,2,...
    capturedLen = arr.length;
    return arr;
  };
  try {
    const f = fakeFetch([{ status: 200, json: { ok: true, token: "T1", state: ST } },
                         { status: 200, json: { ok: true, state: ST } }]);
    const b = MSWalletHttp.create({ url: "/w", fetch: f, store });
    await b.get();
    const dev = f.calls[0].body.deviceId;
    let expectedHex = "";
    for (let i = 0; i < capturedLen; i++) expectedHex += i.toString(16).padStart(2, "0");
    assert.strictEqual(dev, "d-" + expectedHex,
      "deviceId 가 crypto.getRandomValues 의 실제 바이트에서 나오지 않았다 — 카운터/타임스탬프로 샜을 수 있다");
  } finally {
    globalThis.crypto.getRandomValues = orig;
  }
});

// I-A ②: crypto 가 있는데도 폴백(Date.now+Math.random) 형식으로 새면 안 된다. 폴백은
// "d-<timestamp36>-<random>..." 모양(대시가 둘)이고, 정상 경로는 "d-<48자hex>"(대시 하나) 다.
test("device_id — crypto 가 있으면 카운터/타임스탬프 폴백 형식을 쓰지 않는다", async () => {
  const store = fakeStore();
  const f = fakeFetch([{ status: 200, json: { ok: true, token: "T1", state: ST } },
                       { status: 200, json: { ok: true, state: ST } }]);
  const b = MSWalletHttp.create({ url: "/w", fetch: f, store });
  await b.get();
  const dev = f.calls[0].body.deviceId;
  assert.ok(/^d-[0-9a-f]{48}$/.test(dev), "crypto 경로의 hex 인코딩 모양이 아니다 — 폴백으로 샌 것 같다: " + dev);
});

test("device_id 는 서버 최소 길이(W_DEVICE_MIN=32)를 넉넉히 넘는다", async () => {
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
  store.write0("ms_device_id", DEV32);
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
  store.write0("ms_device_id", DEV32);
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
  store.write0("ms_device_id", DEV32);
  store.write0("ms_wallet_token", "T1");
  const f = fakeFetch([{ throw: true }]);
  const b = MSWalletHttp.create({ url: "/w", fetch: f, store });
  const r = await b.get();
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.state, null, "오프라인에서 state 를 지어냈다");
});

// I-B: 위 테스트는 한 번도 성공한 적 없는 새 어댑터라 state:null 이 공짜로 통과한다 — "직전 성공
// 잔량을 캐시해서 오프라인에도 내주는" 회귀는 못 잡는다. 성공 → 실패 순서로 실제로 시험한다.
test("직전 조회가 성공했어도 그 다음이 오프라인이면 옛 잔량을 캐시해 내주지 않는다", async () => {
  const store = fakeStore();
  store.write0("ms_device_id", DEV32);
  store.write0("ms_wallet_token", "T1");
  const f = fakeFetch([
    { status: 200, json: { ok: true, state: ST } },   // 1차 get — 성공
    { throw: true }                                    // 2차 get — 네트워크 끊김
  ]);
  const b = MSWalletHttp.create({ url: "/w", fetch: f, store });
  const r1 = await b.get();
  assert.strictEqual(r1.ok, true);
  assert.deepEqual(r1.state, ST);
  const r2 = await b.get();
  assert.strictEqual(r2.ok, false);
  assert.strictEqual(r2.state, null, "직전 성공 잔량을 캐시해서 오프라인에도 내줬다 — 클라이언트가 잔량을 든 것과 같다");
});

// I-C: 서버는 사업 로직 실패(잔액 부족 등)를 HTTP 200 + ok:false 로 낸다(브리프 계약). 이걸
// 성공으로 오인하거나 reason 을 흘리면 화면이 "차감됐다"고 잘못 알리거나 이유 없이 실패만 보인다.
test("200 이라도 ok:false 면 실패로 취급하고 reason 을 그대로 전달한다", async () => {
  const store = fakeStore();
  store.write0("ms_device_id", DEV32);
  store.write0("ms_wallet_token", "T1");
  const f = fakeFetch([{ status: 200, json: { ok: false, reason: "insufficient", state: ST } }]);
  const b = MSWalletHttp.create({ url: "/w", fetch: f, store });
  const r = await b.spend("full", "idem-x", "AAPL");
  assert.strictEqual(r.ok, false, "200 을 성공으로 취급했다");
  assert.strictEqual(r.reason, "insufficient", "reason 이 유실됐다 — report.js/watchlist.js 둘 다 이 값으로 분기한다");
  assert.deepEqual(r.state, ST, "state 는 그대로 전달돼야 한다(실패해도 잔량 표시는 갱신된다)");
});

// I-D: 토큰이 없는 첫 부팅에서 call() 은 진짜 서버 401 이 아니라 "아직 hello 를 안 했다"는
// 클라이언트 사정으로 {status:401} 을 지어냈었다 — hello() 마저 네트워크로 죽으면 그 지어낸 401 이
// 그대로 살아남아 "unauthorized" 로 보고됐다(리뷰 실측). 실제로는 서버에 닿지도 못했으니 network 다.
test("토큰 없는 첫 부팅에서 네트워크가 완전히 끊기면 unauthorized 가 아니라 network 다", async () => {
  const store = fakeStore();   // deviceId·token 둘 다 없음
  const f = fakeFetch([{ throw: true }]);
  const b = MSWalletHttp.create({ url: "/w", fetch: f, store });
  const r = await b.get();
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, "network", "지어낸 401 이 새어나가 unauthorized 로 보고됐다");
  assert.strictEqual(f.calls.length, 1, "토큰이 없는데 불필요하게 재시도했다");
  assert.strictEqual(f.calls[0].op, "hello");
});

// I-E ①: 저장된 deviceId 가 32자 미만이면(옛 값·손상값) 다음 hello 전에 스스로 새로 만들어야
// 한다 — 안 그러면 서버가 매번 400 bad-device 로 거절하고 deviceId() 는 hello() 안에서만 불려
// 다시 고칠 기회가 없다.
test("저장된 deviceId 가 32자 미만이면 다음 hello 전에 새로 만든다", async () => {
  const store = fakeStore();
  const shortDev = "s".repeat(20);   // 32자 미만
  store.write0("ms_device_id", shortDev);
  const f = fakeFetch([{ status: 200, json: { ok: true, token: "T1", state: ST } },
                       { status: 200, json: { ok: true, state: ST } }]);
  const b = MSWalletHttp.create({ url: "/w", fetch: f, store });
  await b.get();
  const dev = f.calls[0].body.deviceId;
  assert.notStrictEqual(dev, shortDev, "32자 미만인 저장값을 그대로 재사용했다");
  assert.ok(dev.length >= 32, "새로 만든 값도 32자 미만이다: " + dev.length);
  assert.strictEqual(store.read0("ms_device_id", null), dev, "새로 만든 값이 저장되지 않았다");
});

// I-E ②: 로컬 하한을 지켜도(예: 서버가 하한을 나중에 올렸거나 다른 경로로 손상됐다면) 서버가
// bad-device 로 거절할 수 있다 — 그때도 스스로 새 deviceId 를 만들어 한 번 재시도해야 한다.
test("서버가 bad-device 로 거절하면 deviceId 를 새로 만들어 한 번 재시도한다", async () => {
  const store = fakeStore();
  store.write0("ms_device_id", DEV32);   // 로컬 기준으론 유효해 보이는 32자짜리
  const f = fakeFetch([
    { status: 400, json: { ok: false, reason: "bad-device" } },   // 1차 hello — 서버가 거절
    { status: 200, json: { ok: true, token: "T1", state: ST } },  // 재발급 hello — 새 id 로 성공
    { status: 200, json: { ok: true, state: ST } }                // 원래 요청 재시도
  ]);
  const b = MSWalletHttp.create({ url: "/w", fetch: f, store });
  const r = await b.get();
  assert.strictEqual(r.ok, true);
  assert.deepEqual(f.calls.map(c => c.op), ["hello", "hello", "get"]);
  assert.notStrictEqual(f.calls[1].body.deviceId, DEV32, "서버가 거부한 deviceId 를 그대로 재시도에 실었다");
  assert.strictEqual(store.read0("ms_device_id", null), f.calls[1].body.deviceId, "새 deviceId 가 저장되지 않았다");
});

test("bad-device 자가치유도 재발급 재시도는 한 번뿐이다 — 무한 루프 금지", async () => {
  const store = fakeStore();
  store.write0("ms_device_id", DEV32);
  const f = fakeFetch([
    { status: 400, json: { ok: false, reason: "bad-device" } },
    { status: 400, json: { ok: false, reason: "bad-device" } }
  ]);
  const b = MSWalletHttp.create({ url: "/w", fetch: f, store });
  const r = await b.get();
  assert.strictEqual(r.ok, false);
  assert.strictEqual(f.calls.length, 2, "bad-device 재시도가 한 번을 넘었다");
});

// I-E ③: deviceId() 는 hello() 안에서만 불린다 — "짧으면 새로 만든다"는 이미 확인했지만,
// "저장된 값이 이미 유효한데도 매번 새로 만들면 안 된다"는 별도 성질이다(M12, 리뷰 지적).
// hello() 는 재발급마다 다시 불리므로(401 재인증·토큰 만료 후 재조회 등), deviceId() 가
// 호출마다 무조건 새 id 를 만들어 저장해 버리면 재발급 때마다 서버에 새 계정이 생기고
// 이전 계정의 잔량은 조용히 버려진다. 두 번째 hello 왕복을 실제로 일으켜(토큰을 비워 매
// get() 이 hello 를 타게 함) 두 번 다 같은 deviceId 가 나가는지 바이트 단위로 확인한다.
test("deviceId 는 두 번째 hello 왕복에서도 저장된 값을 그대로 재사용한다 — 매번 새로 안 만든다", async () => {
  const store = fakeStore();   // 첫 부팅 — deviceId·token 둘 다 없음
  const f = fakeFetch([
    { status: 200, json: { ok: true, token: "T1", state: ST } },   // 1차 hello
    { status: 200, json: { ok: true, state: ST } },                // 1차 get
    { status: 200, json: { ok: true, token: "T2", state: ST } },   // 2차 hello(토큰을 비워 강제)
    { status: 200, json: { ok: true, state: ST } }                 // 2차 get
  ]);
  const b = MSWalletHttp.create({ url: "/w", fetch: f, store });

  const r1 = await b.get();
  assert.strictEqual(r1.ok, true);
  const helloCallsAfter1 = f.calls.filter(c => c.op === "hello");
  assert.strictEqual(helloCallsAfter1.length, 1);
  const dev1 = helloCallsAfter1[0].body.deviceId;

  store.write0("ms_wallet_token", null);   // 토큰 만료 시뮬레이션 — 다음 get() 이 hello 를 다시 탄다
  const r2 = await b.get();
  assert.strictEqual(r2.ok, true);
  const helloCallsAfter2 = f.calls.filter(c => c.op === "hello");
  assert.strictEqual(helloCallsAfter2.length, 2, "두 번째 hello 왕복이 실제로 안 일어났다 — 테스트 전제가 깨졌다");
  const dev2 = helloCallsAfter2[1].body.deviceId;

  assert.strictEqual(dev2, dev1,
    "두 번째 hello 가 다른 deviceId 를 보냈다 — 재발급마다 서버에 새 계정이 생기고 이전 잔량이 버려진다(M12)");
  assert.strictEqual(store.read0("ms_device_id", null), dev1, "저장된 deviceId 도 바뀌었다");
});

test("spend 가 ref 와 idem 을 실어 보낸다", async () => {
  const store = fakeStore();
  store.write0("ms_device_id", DEV32);
  store.write0("ms_wallet_token", "T1");
  const f = fakeFetch([{ status: 200, json: { ok: true, charged: true, reason: null, state: ST } }]);
  const b = MSWalletHttp.create({ url: "/w", fetch: f, store });
  const r = await b.spend("full", "idem-1", "AAPL");
  assert.strictEqual(r.ok, true);
  assert.strictEqual(f.calls[0].body.runType, "full");
  assert.strictEqual(f.calls[0].body.idem, "idem-1");
  assert.strictEqual(f.calls[0].body.ref, "AAPL");
});

// I-F: refund 는 돈을 돌려주는 경로인데 지금까지 이 파일에 단 하나의 직접 테스트도 없었다.
// op 를 "get" 으로 바꿔도(엉뚱한 엔드포인트를 때려도) 잡는 테스트가 없었다는 뜻이다.
test("refund 가 idem 을 실어 op:refund 로 보낸다", async () => {
  const store = fakeStore();
  store.write0("ms_device_id", DEV32);
  store.write0("ms_wallet_token", "T1");
  const f = fakeFetch([{ status: 200, json: { ok: true, reason: null, state: ST } }]);
  const b = MSWalletHttp.create({ url: "/w", fetch: f, store });
  const r = await b.refund("idem-9");
  assert.strictEqual(r.ok, true);
  assert.strictEqual(f.calls[0].op, "refund", "refund 가 op:refund 를 안 보냈다 — 엉뚱한 엔드포인트를 때릴 수 있다");
  assert.strictEqual(f.calls[0].body.idem, "idem-9");
});

test("checkin 이 op:checkin 으로 보내고 granted·capped 를 그대로 전달한다", async () => {
  const store = fakeStore();
  store.write0("ms_device_id", DEV32);
  store.write0("ms_wallet_token", "T1");
  const f = fakeFetch([{ status: 200, json: { ok: true, granted: 0, capped: true, reason: null, state: ST } }]);
  const b = MSWalletHttp.create({ url: "/w", fetch: f, store });
  const r = await b.checkin();
  assert.strictEqual(f.calls[0].op, "checkin", "checkin 의 op 이름이 틀렸다");
  assert.strictEqual(r.granted, 0);
  assert.strictEqual(r.capped, true, "capped 가 유실되면 화면 안내가 사라진다");
});

// I-G: 대본이 뭘 답하든 요청 자체의 모양(메서드·헤더·URL)이 틀리면 실제 서버는 405/400 으로
// 거절한다. fakeFetch 는 이미 method·Content-Type·url 을 다 잡고 있었는데 아무도 검사하지 않았다.
test("요청 모양 — POST · Content-Type:application/json · 지정한 url 로 보낸다", async () => {
  const store = fakeStore();
  store.write0("ms_device_id", DEV32);
  store.write0("ms_wallet_token", "T1");
  const f = fakeFetch([{ status: 200, json: { ok: true, state: ST } }]);
  const b = MSWalletHttp.create({ url: "https://example.test/wallet-api.php", fetch: f, store });
  await b.get();
  assert.strictEqual(f.calls[0].method, "POST", "GET 으로 보내면 서버가 405 를 낸다(method 405)");
  assert.strictEqual(f.calls[0].contentType, "application/json",
    "Content-Type 이 빠지면 서버가 400 bad-request 로 거절한다");
  assert.strictEqual(f.calls[0].url, "https://example.test/wallet-api.php", "url 이 무시됐다");
});

// ── 미확인 환급 큐 (최종 리뷰 LIVE B) ────────────────────────────────────────
// refund 를 부르는 계기는 "OHLC 로드가 전부 실패했다"이고, 폰에서 그건 대개 네트워크가 끊겼다는
// 뜻이다 — 즉 환급 호출 자체도 같은 이유로 실패한다. 화면들은 rf.ok 를 문구에만 쓰고 레코드를
// 버렸으므로, 프로덕션에서 가장 자주 필요한 환급이 가장 확실하게 유실되는 구조였다.
// w_refund 는 멱등이라 재시도가 공짜다.

test("환급이 네트워크로 실패하면 큐에 남고, 다음 지갑 호출에서 다시 나간다", async () => {
  const store = fakeStore();
  store.write0("ms_device_id", DEV32);
  store.write0("ms_wallet_token", "T1");
  const f = fakeFetch([
    { throw: true },                                              // refund — 그물에 걸린다
    { throw: true },                                              // 그 뒤 재인증 hello 도 못 나간다
    { status: 200, json: { ok: true, state: ST } },               // 다음 get 본체
    { status: 200, json: { ok: true, reason: null, state: ST } }  // 배수된 refund 재시도
  ]);
  const b = MSWalletHttp.create({ url: "/w", fetch: f, store });
  const r = await b.refund("idem-lost");
  assert.strictEqual(r.ok, false, "네트워크 실패인데 성공으로 보고했다");
  assert.deepStrictEqual(store.read0("ms_pending_refunds", null), ["idem-lost"],
    "실패한 환급이 버려졌다 — 사용자는 답을 못 받은 값을 낸 채 복구 수단이 없다");

  await b.get();
  await new Promise(res => setTimeout(res, 0));   // 배수는 사용자 호출을 지연시키지 않는다(비동기)
  const refunds = f.calls.filter(c => c.op === "refund");
  assert.strictEqual(refunds.length, 2, "다음 호출이 큐를 배수하지 않았다: " + f.calls.map(c => c.op).join(","));
  assert.strictEqual(refunds[1].body.idem, "idem-lost", "재시도가 다른 idem 을 보냈다");
  assert.deepStrictEqual(b.pendingRefunds(), [], "확정 성공인데 큐가 안 비었다");
});

test("서버가 확정으로 답한 환급은 큐에 남지 않는다 — 영원히 재시도하지 않는다", async () => {
  const store = fakeStore();
  store.write0("ms_device_id", DEV32);
  store.write0("ms_wallet_token", "T1");
  const f = fakeFetch([{ status: 200, json: { ok: false, reason: "already-refunded", state: ST } }]);
  const b = MSWalletHttp.create({ url: "/w", fetch: f, store });
  await b.refund("idem-done");
  assert.deepStrictEqual(b.pendingRefunds(), [],
    "재시도해도 답이 달라지지 않는 사유(already-refunded)인데 큐에 남겼다 — 매 호출마다 헛요청이 나간다");
});

test("서버 500 으로 끝난 환급은 큐에 남는다 — 응답을 못 받은 것과 같다", async () => {
  const store = fakeStore();
  store.write0("ms_device_id", DEV32);
  store.write0("ms_wallet_token", "T1");
  const f = fakeFetch([{ status: 500, json: null }]);
  const b = MSWalletHttp.create({ url: "/w", fetch: f, store });
  await b.refund("idem-500");
  assert.deepStrictEqual(b.pendingRefunds(), ["idem-500"], "server-error 인데 환급을 버렸다");
});

test("지난 실행이 남긴 환급은 다음 실행(create)에서 배수된다", async () => {
  const store = fakeStore();
  store.write0("ms_device_id", DEV32);
  store.write0("ms_wallet_token", "T1");
  store.write0("ms_pending_refunds", ["idem-yesterday"]);   // 앱이 죽은 채로 남은 값
  const f = fakeFetch([{ status: 200, json: { ok: true, reason: null, state: ST } }]);
  const b = MSWalletHttp.create({ url: "/w", fetch: f, store });
  await new Promise(r => setTimeout(r, 0));
  assert.strictEqual(f.calls.length, 1, "실행 시점에 큐를 배수하지 않았다");
  assert.strictEqual(f.calls[0].op, "refund");
  assert.strictEqual(f.calls[0].body.idem, "idem-yesterday");
  assert.deepStrictEqual(b.pendingRefunds(), [], "배수 후에도 큐가 남았다");
});

test("큐가 비어 있으면 지갑 호출이 헛요청을 만들지 않는다", async () => {
  const store = fakeStore();
  store.write0("ms_device_id", DEV32);
  store.write0("ms_wallet_token", "T1");
  const f = fakeFetch([{ status: 200, json: { ok: true, state: ST } }]);
  const b = MSWalletHttp.create({ url: "/w", fetch: f, store });
  await b.get();
  assert.deepStrictEqual(f.calls.map(c => c.op), ["get"], "빈 큐인데 요청이 늘었다");
});

// 재시도 분류가 wallet.js 의 maybeCharged 와 갈라지면 두 곳이 서로 다른 판단을 하게 된다
// (한쪽은 idem 을 보존하는데 다른 쪽은 환급을 버리는 식). 목록을 대조해 못박는다.
// 분류의 기본값이 어느 쪽이냐가 이 큐의 안전성을 정한다. 처음엔 "재시도할 사유만 열거"였는데,
// 그러면 목록에 없는 사유 하나가 곧 환급 유실이다 — 실제로 storage(w_db 가 원장을 못 열 때의
// 500)가 그 구멍으로 빠져나갔다. 이 테스트는 행동으로 그 방향을 못박는다: 모르는 사유는 남는다.
async function refundWithReason(reason, status = 200) {
  const store = fakeStore();
  store.write0("ms_device_id", DEV32);
  store.write0("ms_wallet_token", "T1");
  const f = fakeFetch([{ status, json: { ok: false, reason, state: ST } }]);
  const b = MSWalletHttp.create({ url: "/w", fetch: f, store });
  await b.refund("k-" + reason);
  return b.pendingRefunds();
}

test("서버가 storage 500 으로 답한 환급은 큐에 남는다 — 원장을 못 연 것은 확정이 아니다", async () => {
  assert.deepStrictEqual(await refundWithReason("storage", 500), ["k-storage"],
    "storage 를 확정으로 보고 환급을 버렸다 — 이 큐가 막으려던 바로 그 실패다");
});

test("분류가 모르는 새 사유는 재시도 쪽으로 떨어진다 — 기본값이 안전한 방향이다", async () => {
  assert.deepStrictEqual(await refundWithReason("some-future-reason"), ["k-some-future-reason"],
    "모르는 사유를 확정으로 보고 버렸다 — 서버가 사유 하나를 추가하는 것만으로 돈이 사라진다");
});

test("확정 사유 목록은 전부 큐에서 빠진다 — 헛요청을 영원히 돌리지 않는다", async () => {
  for (const r of ["not-found", "already-refunded", "nothing-to-refund", "insufficient",
                   "bad-idem", "bad-ref", "unknown-runtype", "unauthorized", "bad-request"]) {
    assert.deepStrictEqual(await refundWithReason(r), [],
      "확정 사유인데 큐에 남겼다(매 지갑 호출마다 헛요청이 나간다): " + r);
  }
});

test("wallet.js 가 maybe-charged 로 보는 사유는 환급도 반드시 재시도한다", async () => {
  const MSWallet = require("../www/wallet.js");
  for (const r of ["network", "server-error", "busy"]) {
    assert.strictEqual(MSWallet.maybeCharged(r), true, "wallet.js 분류가 바뀌었다: " + r);
    assert.deepStrictEqual(await refundWithReason(r), ["k-" + r],
      "wallet.js 는 '차감됐을 수 있다'로 보는데 환급은 포기했다: " + r);
  }
});

// ── 배수와 결제의 순서 (재리뷰 지적 1) ────────────────────────────────────────
// 배수를 흘려보내면(fire-and-forget) 환급과 결제가 겹친다. 서버에서 실측된 결과:
//   spend k1 full/AAPL → charged, 5→2, 24h 권리
//   spend k2 full/AAPL → 그 권리에 흡수돼 charged:false (공짜 리포트)
//   그제서야 refund k1 도착 → 2→5, 권리 삭제  ⇒ 리포트 둘, 잔량 그대로.
// 환급을 먼저 정착시키면 권리가 없어 k2 가 정상 과금된다. 순서가 유일한 차이다.

// 응답 시점을 손으로 여는 fetch — "아직 안 끝난 환급"을 만들 수 있어야 이 순서를 검사할 수 있다.
function gatedFetch(gateOp) {
  const calls = [];
  let release;
  const gate = new Promise(r => { release = r; });
  const fn = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push(body.op);
    if (body.op === gateOp) await gate;
    return { ok: true, status: 200,
             json: async () => ({ ok: true, charged: true, reason: null, state: ST }) };
  };
  fn.calls = calls;
  fn.release = () => release();
  return fn;
}

test("spend 는 큐에 남은 환급이 정착한 뒤에 나간다 — 겹치면 Full 이 공짜가 된다", async () => {
  const store = fakeStore();
  store.write0("ms_device_id", DEV32);
  store.write0("ms_wallet_token", "T1");
  store.write0("ms_pending_refunds", ["k1"]);   // 지난 실행이 남긴 미확인 환급
  const f = gatedFetch("refund");
  const b = MSWalletHttp.create({ url: "/w", fetch: f, store });

  const p = b.spend("full", "k2", "AAPL");
  await new Promise(r => setTimeout(r, 0));
  assert.deepStrictEqual(f.calls, ["refund"],
    "환급이 아직 정착하지 않았는데 결제를 보냈다 — 서버 권리에 흡수돼 Full 이 공짜로 나간다: " + f.calls.join(","));

  f.release();
  await p;
  assert.deepStrictEqual(f.calls, ["refund", "spend"], "순서가 뒤집혔다: " + f.calls.join(","));
  assert.deepStrictEqual(b.pendingRefunds(), [], "결제 전에 큐가 비워지지 않았다");
});

test("읽기(get)는 배수를 기다리지 않는다 — 재시도 중에 잔량 표시가 멎으면 안 된다", async () => {
  const store = fakeStore();
  store.write0("ms_device_id", DEV32);
  store.write0("ms_wallet_token", "T1");
  store.write0("ms_pending_refunds", ["k1"]);
  const f = gatedFetch("refund");
  const b = MSWalletHttp.create({ url: "/w", fetch: f, store });

  const r = await b.get();          // 환급은 아직 열리지 않았다
  assert.strictEqual(r.ok, true, "읽기가 환급 재시도에 묶였다");
  assert.ok(f.calls.indexOf("get") >= 0, "get 이 나가지 않았다: " + f.calls.join(","));
  f.release();
});
