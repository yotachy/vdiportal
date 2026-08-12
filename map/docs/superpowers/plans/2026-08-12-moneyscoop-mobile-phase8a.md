# 머니스쿱 모바일 Phase 8a — 지갑 클라이언트 계약 + UI 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 스쿱 재화를 화면에 올린다 — 지갑 계약 · 스쿱 필 · 지갑 화면 · 단계 선택 시트 · Full 실행(32지표 × 일·주·월).

**Architecture:** 서버가 이미 있는 것처럼 클라이언트를 짠다 — 비동기·의도 기반 계약(`MSWallet`)에 개발용 백엔드(`wallet-local-stub.js`)를 끼우고, 8b 가 그 파일을 지우고 서버로 바꾼다. 클라이언트는 잔량도 델타도 계산하지 않는다. 주기별 판정 계산은 기존 `MSReportModel` 을 확장해 순수 함수로 둔다.

**Tech Stack:** 바닐라 JS(ES5) · UMD · `node:test` · 빌드 도구 없음

## Global Constraints

- **`mobile/www/` 아래 JS 는 ES5 문법만** — `var` + `function`. 화살표 함수·`let`/`const`·템플릿 리터럴·옵셔널 체이닝 금지. 테스트 파일(`mobile/test/*.test.mjs`)은 ESM 이라 예외
- 새 `mobile/www/*.js` 는 **UMD 팩토리** — `(function(root,factory){ if (typeof module!=="undefined"&&module.exports) module.exports=factory(); else root.MSXxx=factory(); })(typeof self!=="undefined"?self:this, function(){...})`
- **클라이언트는 잔량도 델타도 계산하지 않는다.** `balance - 3` 같은 코드가 있으면 안 된다 — 유일한 예외가 단계 선택 시트의 **표시 전용** 차감 미리보기다
- **모든 `spend` 에 `idem`(uuid).** 같은 `idem` 이 다시 오면 백엔드가 같은 결과를 재현하고 두 번 차감하지 않는다
- **차감과 실행은 한 쌍** — `spend` → 실행 → 실패하면 `refund(idem)`
- **UI 문자열은 영어**, `mobile/www/strings.js` 단일 출처. `strings.test.mjs` 가 키 실존·죽은 키·한글 부재를 검사한다
- **CSS 색은 `var(--토큰)`**, **항목 좌측 세로 컬러 라인 절대 금지**, **CSS 에 `@media` 금지**(2단은 `body.ms-dual`)
- **테스트 기대값은 리터럴로** — 구현 상수를 읽어 기대값을 만들면 항등식이 된다. Phase 3·4·5·6·7 에서 다섯 번 재발했다
- **엔진 무수정** — `map/forge-core.js`·`forge-tools.js`·`forge-app.js`·`forge-draw.js`·`mobile/www/vendor/` 를 건드리지 않는다
- 관문: `cd /home/jschoi0223/projects/vdiportal/map && ./tests/run.sh`. **현재 기준선 579건**(forge-core 259 · forge-tools 81 · landing 28 · moneyscoop-mobile 211). 앞의 셋은 끝까지 변동 없어야 한다
- 커밋 메시지 말미: `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`

**설계서:** [`../specs/2026-08-12-moneyscoop-mobile-phase8a-design.md`](../specs/2026-08-12-moneyscoop-mobile-phase8a-design.md) · **권위 출처:** `mobile/docs/design_handoff/SPEC-economy.md`

**작업 디렉토리:** 모든 경로는 `map/` 기준.

---

## File Structure

| 파일 | 책임 | 상태 |
|---|---|---|
| `mobile/www/wallet.js` | `MSWallet` 계약 — 비용표 · `idem` 생성 · 백엔드 위임 | 신규 |
| `mobile/test/wallet.test.mjs` | 계약 테스트 | 신규 |
| `mobile/www/wallet-local-stub.js` | **개발용 백엔드**. 8b 가 삭제한다 | 신규 |
| `mobile/test/wallet-local-stub.test.mjs` | 규칙 테스트(멱등·상한·스트릭·롤백) | 신규 |
| `mobile/www/report-model.js` | **확장** — `tfRows` · `agreeCount` | 수정 |
| `mobile/test/report-model.test.mjs` | 위 확장분 테스트 | 수정 |
| `mobile/www/screens/wallet.js` | 지갑 화면 + 스쿱 필 | 신규 |
| `mobile/www/tier-sheet.js` | 단계 선택 바텀시트 | 신규 |
| `mobile/www/screens/report.js` | 티어 상태 · 시트 진입 · Full 실행(3주기) · 필 | 수정 |
| `mobile/www/screens/watchlist.js` | 헤더에 필 + `Scan` 아이콘화 | 수정 |
| `mobile/www/app.js` | `wallet` 라우트 | 수정 |
| `mobile/www/strings.js` · `style.css` · `index.html` | | 수정 |
| `mobile/docs/BACKLOG-mobile.md` | 종료 기록 · 확인 항목 · 이월 | 수정 |

---

### Task 1: `MSWallet` — 계약

**Files:**
- Create: `map/mobile/www/wallet.js`
- Test: `map/mobile/test/wallet.test.mjs`

**Interfaces:**
- Consumes: 없음 (의존성 제로)
- Produces:
  - `MSWallet.COSTS` → `{ full:3, custom:5, slot:1, scan:0 }`
  - `MSWallet.costOf(runType)` → `number | null`(모르는 종류)
  - `MSWallet.newIdem()` → `string`
  - `MSWallet.install(backend)` / `MSWallet.isInstalled()` → `boolean`
  - `MSWallet.get()` · `spend(runType, idem)` · `refund(idem)` · `checkin()` → 전부 `Promise<{ ok, state, reason }>`

> **설계서 §3 과 다른 점 하나**: 설계서는 `get() → Promise<State>` 로 적었으나 **넷 다 같은 봉투**(`{ok, state, reason}`)를 돌려준다. 호출부가 성공·실패를 한 가지 방법으로만 다루게 하려는 것이다. `state` 는 `{ balance, cap, streakDays, canCheckin }`.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`map/mobile/test/wallet.test.mjs` 신규 생성:

```js
import { test } from "node:test";
import assert from "node:assert";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const W = require("../www/wallet.js");

function spyBackend() {
  const calls = [];
  const state = { balance: 5, cap: 20, streakDays: 1, canCheckin: true };
  return {
    calls,
    get() { calls.push(["get"]); return Promise.resolve({ ok: true, state: state }); },
    spend(rt, idem) { calls.push(["spend", rt, idem]); return Promise.resolve({ ok: true, state: state }); },
    refund(idem) { calls.push(["refund", idem]); return Promise.resolve({ ok: true, state: state }); },
    checkin() { calls.push(["checkin"]); return Promise.resolve({ ok: true, state: state, granted: 1 }); }
  };
}

test("비용표 — 시안이 정한 값 그대로", () => {
  assert.strictEqual(W.COSTS.full, 3);
  assert.strictEqual(W.COSTS.custom, 5);
  assert.strictEqual(W.COSTS.slot, 1);
  assert.strictEqual(W.COSTS.scan, 0, "스캔은 가격이 시안에 없어 무료다");
});

test("costOf — 모르는 종류는 null(0 이 아니다)", () => {
  assert.strictEqual(W.costOf("full"), 3);
  assert.strictEqual(W.costOf("scan"), 0);
  assert.strictEqual(W.costOf("nope"), null);
  assert.strictEqual(W.costOf(undefined), null);
  assert.strictEqual(W.costOf("toString"), null, "프로토타입 체인이 새면 안 된다");
});

test("newIdem — 매번 다르고 비어 있지 않다", () => {
  const seen = new Set();
  for (let i = 0; i < 200; i++) {
    const v = W.newIdem();
    assert.ok(typeof v === "string" && v.length >= 8, "이상한 idem: " + v);
    assert.ok(!seen.has(v), "idem 이 중복됐다: " + v);
    seen.add(v);
  }
});

test("백엔드가 없으면 넷 다 no-backend 로 떨어지고 던지지 않는다", async () => {
  W.install(null);
  assert.strictEqual(W.isInstalled(), false);
  for (const p of [W.get(), W.spend("full", "i1"), W.refund("i1"), W.checkin()]) {
    const r = await p;
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.reason, "no-backend");
    assert.strictEqual(r.state, null);
  }
});

test("설치하면 그대로 위임한다 — 인자가 보존된다", async () => {
  const b = spyBackend();
  W.install(b);
  assert.strictEqual(W.isInstalled(), true);
  await W.get();
  await W.spend("full", "idem-A");
  await W.refund("idem-A");
  await W.checkin();
  assert.deepEqual(b.calls, [["get"], ["spend", "full", "idem-A"], ["refund", "idem-A"], ["checkin"]]);
  W.install(null);
});

test("모르는 runType 은 백엔드에 닿기 전에 막힌다", async () => {
  const b = spyBackend();
  W.install(b);
  const r = await W.spend("nope", "idem-B");
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, "unknown-runtype");
  assert.deepEqual(b.calls, [], "백엔드가 불렸다");
  W.install(null);
});
```

- [ ] **Step 2: 실패를 확인한다**

```bash
cd /home/jschoi0223/projects/vdiportal/map/mobile && node --test test/wallet.test.mjs 2>&1 | tail -8
```

기대: `Cannot find module '../www/wallet.js'` 로 6건 전부 실패.

- [ ] **Step 3: 최소 구현**

`map/mobile/www/wallet.js` 신규 생성 (**ES5 문법**):

```js
// 지갑 계약. 서버가 이미 있는 것처럼 짠다 — SPEC-economy.md 가 "되돌리기 어려운 둘"로 지목한
// 원장의 위치와 보상 경로를 나중에 붙일 수 있게 하는 이음매다.
// 클라이언트는 잔량도 델타도 계산하지 않는다. 의도(spend)만 보내고 백엔드가 준 state 를 그린다.
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.MSWallet = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // full·custom 은 시안 5a·4a, slot 은 2b("Add TSLA — Costs 1 Scoop")에서 왔다.
  // scan 은 SPEC 의 runType 목록과 2c 의 Spend 목록에 이름만 있고 가격이 어디에도 없다 —
  // 워치리스트의 기본 동작이라 값을 임의로 정하지 않고 무료로 둔다.
  var COSTS = { full: 3, custom: 5, slot: 1, scan: 0 };
  var backend = null;

  function install(b) { backend = b || null; }
  function isInstalled() { return !!backend; }

  function costOf(runType) {
    return Object.prototype.hasOwnProperty.call(COSTS, runType) ? COSTS[runType] : null;
  }

  // 멱등 키 — 모바일망은 재시도한다. 이게 없으면 한 분석에 두 번 과금된다(SPEC §1).
  function newIdem() {
    try { if (typeof crypto !== "undefined" && crypto && crypto.randomUUID) return crypto.randomUUID(); } catch (e) {}
    return "i-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);
  }

  function noBackend() { return Promise.resolve({ ok: false, reason: "no-backend", state: null }); }

  function get() { return backend ? backend.get() : noBackend(); }
  function spend(runType, idem) {
    if (!backend) return noBackend();
    if (costOf(runType) == null) return Promise.resolve({ ok: false, reason: "unknown-runtype", state: null });
    return backend.spend(runType, idem);
  }
  function refund(idem) { return backend ? backend.refund(idem) : noBackend(); }
  function checkin() { return backend ? backend.checkin() : noBackend(); }

  return { COSTS: COSTS, install: install, isInstalled: isInstalled, costOf: costOf,
           newIdem: newIdem, get: get, spend: spend, refund: refund, checkin: checkin };
});
```

- [ ] **Step 4: 통과 확인 + 관문**

```bash
cd /home/jschoi0223/projects/vdiportal/map/mobile && node --test test/wallet.test.mjs 2>&1 | tail -6
cd /home/jschoi0223/projects/vdiportal/map && ./tests/run.sh
```

기대: 신규 6건 통과, `전체 통과 — 585건`(579 + 6). `forge-core` 259 · `forge-tools` 81 · `landing` 28 무변동.

- [ ] **Step 5: 커밋**

```bash
cd /home/jschoi0223/projects/vdiportal/map && git add mobile/www/wallet.js mobile/test/wallet.test.mjs
git commit -m "mobile(p8a): 지갑 계약 MSWallet — 비용표·멱등 키·백엔드 위임

SPEC-economy.md 가 '되돌리기 어려운 둘'로 지목한 원장 위치·보상 경로를
나중에 붙일 수 있게 하는 이음매다. 클라이언트는 잔량도 델타도 계산하지 않고
의도(spend)만 보낸다.

scan 은 무료 — SPEC 의 runType 목록과 2c 의 Spend 목록에 이름만 있고 가격이
시안 어디에도 없다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: 스텁 백엔드 — 규칙이 사는 곳

**Files:**
- Create: `map/mobile/www/wallet-local-stub.js`
- Test: `map/mobile/test/wallet-local-stub.test.mjs`

**Interfaces:**
- Consumes: `MSStore`(저장) · `MSWallet.costOf`(가격, 주입받는다)
- Produces:
  - `MSWalletLocalStub.create(opts)` → 백엔드 객체 `{ get, spend, refund, checkin }`
  - `opts = { costOf, now }` — `costOf(runType)→number|null` 필수, `now()→Date` 선택(기본 `new Date()`)
  - `MSWalletLocalStub.CAP` = 20 · `SEED` = 5

**저장 모양**(`SPEC §1` 의 `accounts` + `ledger` 축소판, `MSStore` 키 `ms_wallet`):
```js
{ balance, streakDays, lastCheckin, entries: [ { idem, delta, reason, at } ] }
```

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`map/mobile/test/wallet-local-stub.test.mjs` 신규 생성:

```js
import { test } from "node:test";
import assert from "node:assert";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const Stub = require("../www/wallet-local-stub.js");
const MSStore = require("../www/store.js");
const MSWallet = require("../www/wallet.js");

function memBackend() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
}
// 기기 시계를 고정해 출석 규칙을 결정적으로 시험한다. 스텁은 서버 시간을 못 쓰므로
// 이 주입이 곧 그 한계를 드러내는 지점이기도 하다(설계서 §4.1).
function at(iso) { return function () { return new Date(iso); }; }
function mk(nowFn) {
  MSStore.install(memBackend());
  return Stub.create({ costOf: MSWallet.costOf, now: nowFn || at("2026-08-12T09:00:00Z") });
}

test("첫 사용에 5개를 시드하고 상한은 20이다", async () => {
  const b = mk();
  const r = await b.get();
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.state.balance, 5);
  assert.strictEqual(r.state.cap, 20);
});

test("spend — 차감되고 잔량이 줄어든다", async () => {
  const b = mk();
  const r = await b.spend("full", "i1");
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.state.balance, 2, "5 - 3");
});

test("spend 멱등 — 같은 idem 이 두 번 와도 한 번만 차감된다", async () => {
  const b = mk();
  const a = await b.spend("full", "same");
  const c = await b.spend("full", "same");
  assert.strictEqual(a.state.balance, 2);
  assert.strictEqual(c.state.balance, 2, "두 번 차감됐다");
  assert.strictEqual(c.replayed, true);
});

test("spend — 잔량이 부족하면 실패하고 잔량이 그대로다", async () => {
  const b = mk();
  await b.spend("full", "i1");          // 5 → 2
  const r = await b.spend("full", "i2"); // 2 로는 3 을 못 낸다
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, "insufficient");
  assert.strictEqual(r.state.balance, 2);
});

test("spend — 무료(scan)는 잔량을 건드리지 않는다", async () => {
  const b = mk();
  const r = await b.spend("scan", "i1");
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.state.balance, 5);
});

test("refund — 잔량이 원복되고 원장에 두 줄이 남는다", async () => {
  const b = mk();
  await b.spend("full", "i1");
  const r = await b.refund("i1");
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.state.balance, 5);
  assert.strictEqual(r.entryCount, 2, "차감 한 줄 + 환급 한 줄");
});

test("refund — 없는 idem 이거나 이미 환급했으면 아무 일도 없다", async () => {
  const b = mk();
  await b.spend("full", "i1");
  await b.refund("i1");
  const again = await b.refund("i1");
  assert.strictEqual(again.ok, false);
  assert.strictEqual(again.state.balance, 5, "두 번 환급됐다");
  const none = await b.refund("never");
  assert.strictEqual(none.ok, false);
});

test("checkin — 하루 1회, 다음날이면 스트릭이 는다", async () => {
  const b1 = mk(at("2026-08-12T09:00:00Z"));
  const a = await b1.checkin();
  assert.strictEqual(a.ok, true);
  assert.strictEqual(a.granted, 1);
  assert.strictEqual(a.state.balance, 6);
  assert.strictEqual(a.state.streakDays, 1);
  const dup = await b1.checkin();
  assert.strictEqual(dup.ok, false);
  assert.strictEqual(dup.reason, "already-checked-in");
  assert.strictEqual(dup.state.balance, 6);
});

test("checkin — 하루 건너뛰면 스트릭이 1 로 리셋된다", async () => {
  let d = "2026-08-12T09:00:00Z";
  const b = Stub.create({ costOf: MSWallet.costOf, now: () => new Date(d) });
  MSStore.install(memBackend());
  await b.checkin();                       // day1
  d = "2026-08-13T09:00:00Z"; await b.checkin();  // day2 → streak 2
  d = "2026-08-15T09:00:00Z";                     // 하루 건너뜀
  const r = await b.checkin();
  assert.strictEqual(r.state.streakDays, 1);
});

test("checkin — 7일 연속이면 상자 +5 가 더해진다", async () => {
  let d = new Date("2026-08-12T09:00:00Z");
  MSStore.install(memBackend());
  const b = Stub.create({ costOf: MSWallet.costOf, now: () => d });
  let last = null;
  for (let i = 0; i < 7; i++) {
    last = await b.checkin();
    d = new Date(d.getTime() + 86400000);
  }
  assert.strictEqual(last.state.streakDays, 7);
  assert.strictEqual(last.granted, 6, "출석 1 + 상자 5");
});

test("상한 20 을 넘는 지급은 절삭되고 그 사실이 결과에 담긴다", async () => {
  let d = new Date("2026-08-12T09:00:00Z");
  MSStore.install(memBackend());
  const b = Stub.create({ costOf: MSWallet.costOf, now: () => d });
  // 출석만으로 상한까지 밀어올린다(5 시드 + 매일 1, 7일차 +5)
  let last = null;
  for (let i = 0; i < 20; i++) {
    last = await b.checkin();
    d = new Date(d.getTime() + 86400000);
  }
  assert.strictEqual(last.state.balance, 20, "상한을 넘었다");
  assert.strictEqual(last.capped, true);
});
```

- [ ] **Step 2: 실패를 확인한다**

```bash
cd /home/jschoi0223/projects/vdiportal/map/mobile && node --test test/wallet-local-stub.test.mjs 2>&1 | tail -8
```

기대: `Cannot find module '../www/wallet-local-stub.js'` 로 11건 전부 실패.

- [ ] **Step 3: 최소 구현**

`map/mobile/www/wallet-local-stub.js` 신규 생성 (**ES5 문법**):

```js
// ⚠️ 개발용 지갑 백엔드 — 프로덕션에 나가면 안 된다.
// SPEC-economy.md §1 이 경고한 바로 그 상태(클라이언트가 잔량을 든 상태)다. 루팅된 기기에서
// localStorage 는 쉽게 닿고, 이 파일이 살아 있는 한 잔량은 조작 가능하다.
// 8b(서버 원장)는 이 파일을 '교체'가 아니라 '삭제'한다 — 규칙이 두 벌이면 갈린다.
//
// 못 하는 것 둘(설계서 §4.1): ①출석 판정이 기기 시계를 쓴다 ②재설치하면 5개를 다시 받는다.
// 둘 다 서버 시간·device_id 로만 막을 수 있다.
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.MSWalletLocalStub = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var KEY = "ms_wallet";
  var CAP = 20, SEED = 5, CHECKIN = 1, CHEST_EVERY = 7, CHEST = 5;
  var warned = false;

  function store() {
    if (typeof MSStore !== "undefined") return MSStore;
    if (typeof require === "function") { try { return require("./store.js"); } catch (e) {} }
    return null;
  }
  function load() {
    var s = store(), raw = s ? s.read0(KEY) : null;
    if (!raw || typeof raw !== "object") raw = { balance: SEED, streakDays: 0, lastCheckin: null, entries: [] };
    if (!Array.isArray(raw.entries)) raw.entries = [];
    return raw;
  }
  function save(w) { var s = store(); if (s) s.write0(KEY, w); return w; }

  function ymd(d) {
    return d.getUTCFullYear() + "-" + ("0" + (d.getUTCMonth() + 1)).slice(-2) + "-" + ("0" + d.getUTCDate()).slice(-2);
  }
  function dayDiff(a, b) { return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000); }

  function stateOf(w, nowFn) {
    return { balance: w.balance, cap: CAP, streakDays: w.streakDays,
             canCheckin: w.lastCheckin !== ymd(nowFn()) };
  }
  function findEntry(w, idem) {
    for (var i = 0; i < w.entries.length; i++) { if (w.entries[i].idem === idem) return w.entries[i]; }
    return null;
  }
  function push(w, idem, delta, reason, nowFn) {
    w.entries.push({ idem: idem, delta: delta, reason: reason, at: nowFn().toISOString() });
    w.balance += delta;
    return w;
  }

  function create(opts) {
    var o = opts || {};
    var costOf = o.costOf;
    var nowFn = o.now || function () { return new Date(); };
    if (!warned) {
      warned = true;
      if (typeof console !== "undefined" && console.warn) {
        console.warn("[MSWallet] 개발용 로컬 스텁이 설치됐습니다. 프로덕션 빌드에 포함되면 안 됩니다 — 8b 서버 원장이 이 파일을 대체합니다.");
      }
    }

    function ok(w, extra) {
      var r = { ok: true, state: stateOf(w, nowFn) };
      if (extra) { for (var k in extra) { if (Object.prototype.hasOwnProperty.call(extra, k)) r[k] = extra[k]; } }
      return Promise.resolve(r);
    }
    function fail(w, reason, extra) {
      var r = { ok: false, reason: reason, state: stateOf(w, nowFn) };
      if (extra) { for (var k in extra) { if (Object.prototype.hasOwnProperty.call(extra, k)) r[k] = extra[k]; } }
      return Promise.resolve(r);
    }

    return {
      get: function () { return ok(save(load())); },

      spend: function (runType, idem) {
        var w = load();
        var prev = findEntry(w, idem);
        if (prev) return ok(w, { replayed: true });     // 멱등 — 같은 결과를 재현한다
        var cost = costOf ? costOf(runType) : null;
        if (cost == null) return fail(w, "unknown-runtype");
        if (cost === 0) { push(w, idem, 0, "spend:" + runType, nowFn); return ok(save(w)); }
        if (w.balance < cost) return fail(w, "insufficient");
        push(w, idem, -cost, "spend:" + runType, nowFn);
        return ok(save(w));
      },

      refund: function (idem) {
        var w = load();
        var e = findEntry(w, idem);
        if (!e || e.delta >= 0) return fail(w, "nothing-to-refund");
        if (findEntry(w, idem + ":refund")) return fail(w, "already-refunded");
        push(w, idem + ":refund", -e.delta, "refund", nowFn);
        return ok(save(w), { entryCount: w.entries.length });
      },

      checkin: function () {
        var w = load(), today = ymd(nowFn());
        if (w.lastCheckin === today) return fail(w, "already-checked-in");
        var streak = (w.lastCheckin && dayDiff(w.lastCheckin, today) === 1) ? w.streakDays + 1 : 1;
        var want = CHECKIN + ((streak % CHEST_EVERY === 0) ? CHEST : 0);
        // 상한은 지급 시점에 문다 — 넘치는 만큼은 버려지고 그 사실을 결과에 담는다(SPEC §3).
        var room = Math.max(0, CAP - w.balance);
        var granted = Math.min(want, room);
        w.streakDays = streak; w.lastCheckin = today;
        push(w, "checkin:" + today, granted, "checkin", nowFn);
        return ok(save(w), { granted: granted, capped: granted < want });
      }
    };
  }

  return { create: create, CAP: CAP, SEED: SEED };
});
```

> **`MSStore` 에 원시 읽기·쓰기가 필요하다.** `store.js` 는 지금 워치리스트·스캔·`lastSym` 전용 함수만 노출한다. **`read0(key, fallback)` · `write0(key, value)` 두 줄을 export 에 추가해라** — 내부 `read`/`write` 헬퍼를 그대로 내보내면 된다. 다른 소비자는 없다.

- [ ] **Step 4: `store.js` 에 원시 접근 두 개를 연다**

`mobile/www/store.js` 의 `return { KEYS: KEYS, SEED: SEED, install: install, ... }` 에 추가한다:

```js
           read0: read, write0: write,
```

- [ ] **Step 5: 통과 확인 + 관문**

```bash
cd /home/jschoi0223/projects/vdiportal/map/mobile && node --test test/wallet-local-stub.test.mjs 2>&1 | tail -6
cd /home/jschoi0223/projects/vdiportal/map && ./tests/run.sh
```

기대: 신규 11건 통과, `전체 통과 — 596건`(585 + 11).

- [ ] **Step 6: 커밋**

```bash
cd /home/jschoi0223/projects/vdiportal/map && git add mobile/www/wallet-local-stub.js mobile/test/wallet-local-stub.test.mjs mobile/www/store.js
git commit -m "mobile(p8a): 개발용 지갑 백엔드 — 멱등·상한·스트릭·롤백

SPEC-economy.md 의 accounts+ledger 를 축소해 흉내낸다. entries 가 멱등과
롤백을 동시에 떠받친다 — 같은 idem 이면 결과를 재현하고 refund 는 반대 부호
줄을 쌓는다.

⚠️ 프로덕션 금지 — 8b 서버 원장이 이 파일을 '교체'가 아니라 '삭제'한다.
규칙이 두 벌이면 갈린다(이 저장소가 다섯 번 당한 문제).

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: `MSReportModel` 확장 — 주기 행과 동의 수

**Files:**
- Modify: `map/mobile/www/report-model.js` (`hitRate` 정의 아래 · export)
- Test: `map/mobile/test/report-model.test.mjs` (파일 끝에 추가)

**Interfaces:**
- Consumes: 같은 파일의 `confidence(FC, prediction, regime)` · `ForgeCore`(인자로 받음)
- Produces:
  - `MSReportModel.tfRows(FC, runs)` → `[{ tf, regime, prob, target, reason }]`
  - `MSReportModel.agreeCount(runs)` → `{ agree, total }`
  - `runs` 는 **배열**이다: `[{ tf, out, error }]`. `out` 은 `ForgeCore.run()` 결과, `error` 는 문자열 사유(둘 중 하나만 있다). 순서가 곧 표시 순서다

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`map/mobile/test/report-model.test.mjs` **파일 끝에** 추가:

```js
function fakeOut(regime, target) {
  const anchor = 100, path = [], hi = [];
  for (let k = 1; k <= 24; k++) { const v = anchor + (regime === "bear" ? -1 : 1) * k * 0.4; path.push(v); hi.push(v + 3 * Math.sqrt(k)); }
  return { verdict: { regime, target }, prediction: { anchor, path, hi, lo: path.map(v => v - 5) } };
}

test("tfRows — 세 주기가 다 있으면 3행, 순서가 보존된다", () => {
  const runs = [
    { tf: "1day", out: fakeOut("bull", 170.7) },
    { tf: "1week", out: fakeOut("bull", 178.4) },
    { tf: "1month", out: fakeOut("neutral", 184.0) }
  ];
  const rows = M.tfRows(FC, runs);
  assert.deepEqual(rows.map(r => r.tf), ["1day", "1week", "1month"]);
  assert.deepEqual(rows.map(r => r.regime), ["bull", "bull", "neutral"]);
  assert.strictEqual(rows[1].target, 178.4);
  assert.ok(rows[0].prob > 0 && rows[0].prob <= 100);
});

test("tfRows — 이력이 모자란 주기는 사유가 담기고 값이 비어 있다", () => {
  const runs = [
    { tf: "1day", out: fakeOut("bull", 170.7) },
    { tf: "1week", error: "not-enough-history" },
    { tf: "1month", error: "not-enough-history" }
  ];
  const rows = M.tfRows(FC, runs);
  assert.strictEqual(rows.length, 3, "행 자체는 남아야 한다 — 빈칸이 아니라 사유를 보여준다");
  assert.strictEqual(rows[1].reason, "not-enough-history");
  assert.strictEqual(rows[1].prob, null);
  assert.strictEqual(rows[1].target, null);
  assert.strictEqual(rows[1].regime, null);
});

test("tfRows — 중립 주기는 확신이 null 이다(방향이 없다)", () => {
  const rows = M.tfRows(FC, [{ tf: "1day", out: fakeOut("neutral", 100) }]);
  assert.strictEqual(rows[0].prob, null);
});

test("tfRows — 빈 입력이면 빈 배열", () => {
  assert.deepEqual(M.tfRows(FC, []), []);
  assert.deepEqual(M.tfRows(FC, null), []);
});

test("agreeCount — 일봉 방향과 같은 주기를 센다", () => {
  const all = [
    { tf: "1day", out: fakeOut("bull", 1) },
    { tf: "1week", out: fakeOut("bull", 1) },
    { tf: "1month", out: fakeOut("bear", 1) }
  ];
  assert.deepEqual(M.agreeCount(all), { agree: 2, total: 3 });
});

test("agreeCount — 실패한 주기는 분모에서 빠진다", () => {
  const runs = [
    { tf: "1day", out: fakeOut("bull", 1) },
    { tf: "1week", error: "not-enough-history" },
    { tf: "1month", out: fakeOut("bull", 1) }
  ];
  assert.deepEqual(M.agreeCount(runs), { agree: 2, total: 2 });
});

test("agreeCount — 기준(첫 성공 주기)이 없으면 0/0", () => {
  assert.deepEqual(M.agreeCount([{ tf: "1day", error: "x" }]), { agree: 0, total: 0 });
  assert.deepEqual(M.agreeCount([]), { agree: 0, total: 0 });
});
```

- [ ] **Step 2: 실패를 확인한다**

```bash
cd /home/jschoi0223/projects/vdiportal/map/mobile && node --test test/report-model.test.mjs 2>&1 | tail -8
```

기대: `M.tfRows is not a function` 으로 신규 7건 실패.

- [ ] **Step 3: 구현한다**

`mobile/www/report-model.js` 의 `hitRate` 정의 **바로 아래**에 추가한다:

```js
  // 주기 행 — runs 는 [{tf, out, error}] 배열이고 순서가 곧 표시 순서다.
  // 이력이 모자란 주기(신규 상장주의 월봉 등)는 행을 지우지 않고 사유를 담는다 —
  // 빈칸으로 두면 "돈 냈는데 안 준다"로 읽힌다(설계서 §5.5).
  function tfRows(FC, runs) {
    var list = runs || [], out = [], i;
    for (i = 0; i < list.length; i++) {
      var r = list[i];
      if (!r.out) { out.push({ tf: r.tf, regime: null, prob: null, target: null, reason: r.error || "unavailable" }); continue; }
      var v = r.out.verdict || {};
      out.push({ tf: r.tf, regime: v.regime || null,
                 prob: confidence(FC, r.out.prediction, v.regime),
                 target: (typeof v.target === "number" && isFinite(v.target)) ? v.target : null,
                 reason: null });
    }
    return out;
  }

  // 첫 성공 주기(일봉)를 기준으로 같은 방향인 주기 수를 센다. 실패한 주기는 분모에서 빠진다 —
  // 못 읽은 것을 "동의하지 않음"으로 세면 판정이 실제보다 약해 보인다.
  function agreeCount(runs) {
    var list = runs || [], base = null, agree = 0, total = 0, i;
    for (i = 0; i < list.length; i++) {
      var r = list[i];
      if (!r.out || !r.out.verdict) continue;
      total++;
      if (base === null) base = r.out.verdict.regime;
      if (r.out.verdict.regime === base) agree++;
    }
    return { agree: total ? agree : 0, total: total };
  }
```

export 줄에 `tfRows: tfRows, agreeCount: agreeCount,` 를 더한다.

- [ ] **Step 4: 통과 확인 + 관문**

```bash
cd /home/jschoi0223/projects/vdiportal/map/mobile && node --test test/report-model.test.mjs 2>&1 | tail -6
cd /home/jschoi0223/projects/vdiportal/map && ./tests/run.sh
```

기대: `전체 통과 — 603건`(596 + 7).

- [ ] **Step 5: 커밋**

```bash
cd /home/jschoi0223/projects/vdiportal/map && git add mobile/www/report-model.js mobile/test/report-model.test.mjs
git commit -m "mobile(p8a): MSReportModel 확장 — 주기 행·동의 수

Full 이 일·주·월 세 주기를 돌므로 그 결과를 행으로 펴는 계산이 필요하다.
이력이 모자란 주기는 행을 지우지 않고 사유를 담는다 — 빈칸이면 '돈 냈는데
안 준다'로 읽힌다. 실패한 주기는 동의 수의 분모에서도 빠진다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: 스쿱 필 + 지갑 화면 + 라우트

**Files:**
- Create: `map/mobile/www/screens/wallet.js`
- Modify: `map/mobile/www/app.js` · `screens/watchlist.js` · `screens/report.js` · `strings.js` · `index.html`

**Interfaces:**
- Consumes: `MSWallet.get/checkin/COSTS`(Task 1) · `MSWalletLocalStub.create`(Task 2) · `MSStore` · `MSUi` · `MSApp`
- Produces:
  - `MSWalletScreen.render(root)` — 지갑 화면
  - `MSWalletScreen.pill(onTap)` → `HTMLElement` — 스쿱 필. 마운트 후 스스로 `MSWallet.get()` 을 불러 채운다
  - `MSApp.go("wallet")` — 새 라우트
  - DOM 계약(Task 6 CSS 가 건다): `.ms-pill(.is-empty)` · `.wal-head` · `.wal-balance` · `.wal-cap` · `.wal-sec` · `.wal-row(.is-off)` · `.wal-row-amt` · `.wal-streak`

**테스트 없음** — 배선이다. 검증은 `strings.test.mjs` 가드와 통합 관문이다.

- [ ] **Step 1: 문자열을 추가한다**

`mobile/www/strings.js` 의 `t` 객체에 추가:

```js
    walTitle: "Scoops", walCap: "Cap ", walEarn: "Earn", walSpend: "Spend",
    walQuick: "Quick ad · 15s", walFull: "Full ad · 30s",
    walCheckin: "Daily check-in", walChest: "Week 7 chest",
    walSlot: "Add a ticker slot", walDeep: "Deep analysis", walOptimiser: "Parameter optimiser",
    walSoon: "Coming soon", walDay: "Day ", walChestAway: " days to the chest",
    walCheckedIn: "Claimed today", walCapped: " · cap reached, the rest was discarded",
    walBack: "Back",
```

- [ ] **Step 2: 스크립트 태그를 추가한다**

`mobile/www/index.html` 에서 `<script src="report-model.js"></script>` **바로 위**에 셋을 넣는다. 순서가 중요하다 — 계약이 스텁보다 먼저, 스텁이 화면보다 먼저:

```html
<script src="wallet.js"></script>
<!-- ⚠️ 개발용 스텁 — 프로덕션 빌드에서 제거하고 8b 서버 백엔드로 교체할 것 -->
<script src="wallet-local-stub.js"></script>
```

그리고 `<script src="screens/report.js"></script>` **바로 위**에:

```html
<script src="screens/wallet.js"></script>
```

- [ ] **Step 3: 스텁을 설치한다**

`mobile/www/app.js` 의 `DOMContentLoaded` 핸들러에서 `MSStore.seedIfEmpty();` **바로 위**에 넣는다:

```js
    // 개발용 백엔드. 8b 는 이 줄과 index.html 의 스크립트 태그를 서버 백엔드로 바꾼다.
    if (typeof MSWalletLocalStub !== "undefined" && !MSWallet.isInstalled()) {
      MSWallet.install(MSWalletLocalStub.create({ costOf: MSWallet.costOf }));
    }
```

- [ ] **Step 4: 지갑 화면과 필을 만든다**

`mobile/www/screens/wallet.js` 신규 생성:

```js
// 지갑 화면 + 스쿱 필. 잔량·스트릭은 전부 백엔드가 준 state 를 그대로 그린다 —
// 클라이언트가 계산하지 않는다(SPEC-economy.md §1).
(function () {
  "use strict";

  function fmt(n) { return (typeof n === "number" && isFinite(n)) ? String(n) : ""; }

  // 필은 비동기로 채워진다 — get() 이 오기 전엔 빈칸이다. 지금은 로컬이라 즉시지만 8b 에선 네트워크다.
  function pill(onTap) {
    var el = MSUi.el("button", "ms-pill is-empty");
    el.setAttribute("aria-label", MSStr.t.walTitle);
    el.appendChild(MSUi.el("span", "ms-pill-ico", "◆"));
    var num = MSUi.el("span", "ms-pill-n", "");
    el.appendChild(num);
    if (onTap) el.addEventListener("click", onTap);
    MSWallet.get().then(function (r) {
      if (!r.ok || !r.state) return;
      num.textContent = fmt(r.state.balance);
      el.classList.remove("is-empty");
    });
    return el;
  }

  function row(label, amt, opts) {
    var o = opts || {};
    var r = MSUi.el("div", "wal-row" + (o.off ? " is-off" : ""));
    r.appendChild(MSUi.el("span", "wal-row-name", label));
    if (o.note) r.appendChild(MSUi.el("span", "wal-row-note", o.note));
    r.appendChild(MSUi.el("span", "wal-row-amt", amt));
    if (o.onTap && !o.off) r.addEventListener("click", o.onTap);
    return r;
  }

  function render(root) {
    function draw(state, msg) {
      root.innerHTML = "";
      var scr = MSUi.el("div", "scr");

      var head = MSUi.el("div", "wal-head");
      var back = MSUi.el("button", "rp-back");
      back.setAttribute("aria-label", MSStr.t.walBack);
      back.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>';
      back.addEventListener("click", function () { MSApp.go("watchlist"); });
      head.appendChild(back);
      head.appendChild(MSUi.el("span", "overline", MSStr.t.walTitle));
      if (state) head.appendChild(MSUi.el("span", "wal-cap", MSStr.t.walCap + state.cap));
      scr.appendChild(head);

      scr.appendChild(MSUi.el("div", "wal-balance", state ? fmt(state.balance) : ""));
      if (msg) scr.appendChild(MSUi.el("div", "wal-msg", msg));

      var earn = MSUi.el("div", "wal-sec");
      earn.appendChild(MSUi.el("div", "rp-sec-title", MSStr.t.walEarn));
      earn.appendChild(row(MSStr.t.walQuick, "+1", { off: true, note: MSStr.t.walSoon }));
      earn.appendChild(row(MSStr.t.walFull, "+3", { off: true, note: MSStr.t.walSoon }));
      var can = !!(state && state.canCheckin);
      earn.appendChild(row(MSStr.t.walCheckin, "+1", {
        off: !can, note: can ? "" : MSStr.t.walCheckedIn,
        onTap: function () {
          MSWallet.checkin().then(function (r) {
            draw(r.state, r.ok ? (MSStr.t.walDay + r.state.streakDays + (r.capped ? MSStr.t.walCapped : "")) : "");
          });
        }
      }));
      var away = state ? (7 - (state.streakDays % 7)) : 0;
      earn.appendChild(row(MSStr.t.walChest, "+5", { off: true, note: state ? (away + MSStr.t.walChestAway) : "" }));
      scr.appendChild(earn);

      var spend = MSUi.el("div", "wal-sec");
      spend.appendChild(MSUi.el("div", "rp-sec-title", MSStr.t.walSpend));
      spend.appendChild(row(MSStr.t.walSlot, String(MSWallet.COSTS.slot), {}));
      spend.appendChild(row(MSStr.t.walDeep, String(MSWallet.COSTS.full), {}));
      spend.appendChild(row(MSStr.t.walOptimiser, String(MSWallet.COSTS.custom), {}));
      scr.appendChild(spend);

      root.appendChild(scr);
    }

    draw(null, "");
    MSWallet.get().then(function (r) { draw(r.state, ""); });
  }

  window.MSWalletScreen = { render: render, pill: pill };
})();
```

- [ ] **Step 5: 라우트를 넓힌다**

`mobile/www/app.js` 에서 세 곳을 바꾼다.

단일 모드 분기(`if (state.showing === "report" && state.selectedSym) ...`)를 아래로 교체:

```js
    if (state.showing === "wallet") MSWalletScreen.render(rootEl);
    else if (state.showing === "report" && state.selectedSym) MSReport.render(rootEl, { sym: state.selectedSym });
    else MSWatchlist.render(rootEl);
```

2단 분기의 `renderReportPane()` 안에서 오른쪽 칸이 지갑도 그리게 한다 — `reportPane.innerHTML = ""` 다음 줄부터:

```js
    if (state.showing === "wallet") { MSWalletScreen.render(reportPane); markSelected(); return; }
```

`go()` 에 라우트를 더한다 — `if (route === "report" && sym) {` **앞**에:

```js
    if (route === "wallet") {
      state.showing = "wallet";
      if (dual) { renderReportPane(); return; }
      renderShell(); return;
    }
```

- [ ] **Step 6: 두 헤더에 필을 붙인다**

`screens/watchlist.js` 의 `drawShell()` 에서 `scanBtnEl` 을 만드는 블록을 아래로 바꾼다 — **`Scan` 을 아이콘으로 줄이고 필을 넣는다**:

```js
      head.appendChild(MSWalletScreen.pill(function () { MSApp.go("wallet"); }));
      if (list.length) {
        scanBtnEl = MSUi.el("button", "wl-scan");
        scanBtnEl.addEventListener("click", startScan);
        head.appendChild(scanBtnEl);
        updateScanBtn();
      }
```

그리고 `updateScanBtn()` 을 아이콘/텍스트 전환으로 바꾼다:

```js
    function updateScanBtn() {
      if (!scanBtnEl) return;
      // 평상시엔 아이콘만(헤더에 필이 들어와 자리가 없다), 스캔 중에는 진행이 보여야 하므로 텍스트로 늘어난다.
      scanBtnEl.textContent = scanning ? (MSStr.t.wlScanning + scanDone + "/" + scanTotal) : "↻";
      scanBtnEl.setAttribute("aria-label", MSStr.t.wlScan);
      scanBtnEl.classList.toggle("is-ico", !scanning);
      scanBtnEl.disabled = scanning;
    }
```

`screens/report.js` 의 `buildHead()` 에서 `rp-head-pos` 를 붙이는 줄 **다음**에 추가:

```js
      head.appendChild(MSWalletScreen.pill(function () { MSApp.go("wallet"); }));
```

- [ ] **Step 7: 관문**

```bash
cd /home/jschoi0223/projects/vdiportal/map/mobile && node --test test/strings.test.mjs 2>&1 | tail -6
cd /home/jschoi0223/projects/vdiportal/map && ./tests/run.sh
cd mobile && node --check www/screens/wallet.js && node --check www/app.js && node --check www/screens/watchlist.js && node --check www/screens/report.js
```

기대: `전체 통과 — 603건`(신규 테스트 없음). 죽은 키가 잡히면 Step 1 로 돌아가 정리해라.

- [ ] **Step 8: 커밋**

```bash
cd /home/jschoi0223/projects/vdiportal/map && git add mobile/www/screens/wallet.js mobile/www/app.js mobile/www/screens/watchlist.js mobile/www/screens/report.js mobile/www/strings.js mobile/www/index.html
git commit -m "mobile(p8a): 스쿱 필 + 지갑 화면 + wallet 라우트

11a 가 '우상단 스쿱 필 상시'를 지시한다 — 잔량이 안 보이면 모을 이유가
안 생긴다(2c 의 루프 논리). 헤더에 자리를 내려고 Scan 을 아이콘으로 줄이고
스캔 중에만 텍스트로 늘린다.

광고 두 줄은 비활성 — 8d 가 오기 전엔 눌러도 아무 일이 안 일어나는 게 정직하다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: 단계 선택 시트 + Full 실행

**Files:**
- Create: `map/mobile/www/tier-sheet.js`
- Modify: `map/mobile/www/screens/report.js` · `strings.js` · `index.html`

**Interfaces:**
- Consumes: `MSWallet`(Task 1) · `MSReportModel.tfRows/agreeCount`(Task 3) · `MSGraph.full32Graph` · `MSApi.loadTicker`
- Produces: `MSTierSheet.open(opts)` — `opts = { sym, tier, balance, onRun(tier) }`. DOM 계약: `.sheet-scrim` · `.sheet` · `.sheet-tier(.on/.is-off)` · `.sheet-preview` · `.sheet-run`

**테스트 없음** — 배선. 계산은 Task 3 이 이미 덮는다.

- [ ] **Step 1: 문자열을 추가한다**

`strings.js` 의 `t` 에 추가하고, **`rpSoon` 은 삭제한다**(비활성 CTA 가 시트 진입 버튼으로 바뀌어 소비자가 사라진다):

```js
    tsTitle: "Analyse ", tsBasic: "Basic", tsFull: "Full", tsCustom: "Custom",
    tsBasicDesc: "5 indicators · daily only", tsFullDesc: "All 32 indicators · daily, weekly, monthly",
    tsCustomDesc: "All 32 + your weights",
    tsDone: "Free · done", tsPopular: "POPULAR", tsSoon: "Coming soon",
    tsRun: "Run ", tsCost: " Scoops", tsShort: "Not enough Scoops. Come back tomorrow for +1.",
    tsRunning: "Running…", tsFailed: "Analysis failed — your Scoops were returned.",
    rpUpgrade: "Go deeper",
    rpAgreeTf: " of ", rpAgreeTfTail: " timeframes agree",
    rpNoHistory: "Not enough history",
```

- [ ] **Step 2: 시트를 만든다**

`mobile/www/tier-sheet.js` 신규 생성:

```js
// 단계 선택 바텀시트(시안 7a 가 "A bottom sheet" 로 명시).
// 차감 미리보기(5 → 2)는 표시 전용이다 — 실제 차감은 백엔드가 한다.
(function () {
  "use strict";

  function close() {
    var s = document.querySelector(".sheet-scrim");
    if (s && s.parentNode) s.parentNode.removeChild(s);
  }

  function tierRow(key, name, desc, cost, opts) {
    var o = opts || {};
    var r = MSUi.el("button", "sheet-tier" + (o.on ? " on" : "") + (o.off ? " is-off" : ""));
    var left = MSUi.el("div", "sheet-tier-id");
    var nameRow = MSUi.el("div", "sheet-tier-name");
    nameRow.appendChild(MSUi.el("span", null, name));
    if (o.popular) nameRow.appendChild(MSUi.el("span", "sheet-pop", MSStr.t.tsPopular));
    left.appendChild(nameRow);
    left.appendChild(MSUi.el("div", "sheet-tier-desc", desc));
    r.appendChild(left);
    r.appendChild(MSUi.el("span", "sheet-preview", o.preview));
    if (!o.off && o.onPick) r.addEventListener("click", o.onPick);
    return r;
  }

  // opts = { tier, balance, onRun(tier) }
  function open(opts) {
    var o = opts || {}, picked = "full";
    var bal = (typeof o.balance === "number") ? o.balance : null;
    close();

    var scrim = MSUi.el("div", "sheet-scrim");
    scrim.addEventListener("click", function (e) { if (e.target === scrim) close(); });
    var sheet = MSUi.el("div", "sheet");

    function preview(cost) {
      // 표시 전용. 백엔드가 진짜 잔량을 돌려준다(SPEC §1).
      if (bal == null) return "";
      return bal + " → " + Math.max(0, bal - cost);
    }
    function paint() {
      sheet.innerHTML = "";
      sheet.appendChild(MSUi.el("div", "rp-sec-title", MSStr.t.tsTitle + (o.sym || "")));
      sheet.appendChild(tierRow("basic", MSStr.t.tsBasic, MSStr.t.tsBasicDesc, 0,
        { off: true, preview: MSStr.t.tsDone }));
      sheet.appendChild(tierRow("full", MSStr.t.tsFull, MSStr.t.tsFullDesc, MSWallet.COSTS.full,
        { on: picked === "full", popular: true, preview: preview(MSWallet.COSTS.full),
          onPick: function () { picked = "full"; paint(); } }));
      sheet.appendChild(tierRow("custom", MSStr.t.tsCustom, MSStr.t.tsCustomDesc, MSWallet.COSTS.custom,
        { off: true, preview: MSStr.t.tsSoon }));

      var cost = MSWallet.COSTS[picked];
      var run = MSUi.el("button", "btn btn-primary sheet-run", MSStr.t.tsRun + MSStr.t.tsFull + " · " + cost + MSStr.t.tsCost);
      var short = (bal != null && bal < cost);
      run.disabled = short;
      if (short) sheet.appendChild(MSUi.el("p", "sheet-short", MSStr.t.tsShort));
      run.addEventListener("click", function () {
        run.disabled = true; run.textContent = MSStr.t.tsRunning;
        if (o.onRun) o.onRun(picked);
      });
      sheet.appendChild(run);
    }
    paint();

    scrim.appendChild(sheet);
    document.body.appendChild(scrim);
  }

  window.MSTierSheet = { open: open, close: close };
})();
```

`index.html` 의 `<script src="screens/wallet.js"></script>` **바로 위**에 태그를 넣는다:

```html
<script src="tier-sheet.js"></script>
```

- [ ] **Step 3: 리포트에 티어 상태와 Full 실행을 붙인다**

`screens/report.js` 에서 다섯 곳을 바꾼다.

**(a)** 모듈 상단의 `var TIER = "basic";` 을 지운다. `render()` 안 상태 변수 줄에 넣는다:

```js
    var state = "loading", errInfo = null, data = null, an = null, chartRefs = null;
    var tier = "basic";        // 이 화면 수명 동안의 티어. Full 을 사면 "full" 로 올라간다
    var tfRuns = null;         // [{tf, out, error}] — Full 이 채운다
```

그리고 `TIER` 을 쓰던 곳(`MSChartDraw.drawCone(..., TIER, ...)` · `MSChartDraw.linesFor(TIER)`)을 `tier` 로 바꾼다. `paintChart` 는 인자로 받게 해라 — `paintChart(cv, wrap, legend, an, data, sym, tier)`.

**(b)** `analyzeFull(data)` 가 그래프를 선택하게 한다. 함수 시그니처를 `analyzeFull(data, useFull)` 로 바꾸고 첫 줄을:

```js
    var graph = useFull ? MSGraph.full32Graph(ForgeCore) : MSGraph.basicGraph(ForgeCore);
```

**(c)** `buildCta()` 를 시트 진입 버튼으로 바꾼다:

```js
    function buildCta() {
      if (tier !== "basic") return MSUi.el("div");
      var b = MSUi.el("button", "rp-cta", MSStr.t.rpUpgrade);
      b.addEventListener("click", function () {
        MSWallet.get().then(function (r) {
          MSTierSheet.open({ sym: sym, tier: tier, balance: r.state ? r.state.balance : null, onRun: runFull });
        });
      });
      return b;
    }
```

**(d)** `runFull()` 을 `buildCta` **바로 위**에 추가한다. **차감 → 실행 → 실패 시 환급**이 한 쌍이다:

```js
    // SPEC §1: 차감과 실행은 한 트랜잭션. 낙관적 차감을 하지 않는다 —
    // 일봉이 실패하면 환급한다. 주·월은 없어도 차감을 유지하고 그 행에 사유를 적는다(설계서 §5.5).
    function runFull() {
      var idem = MSWallet.newIdem();
      MSWallet.spend("full", idem).then(function (sp) {
        if (!sp.ok) { MSTierSheet.close(); alert(MSStr.t.tsShort); return; }
        var tfs = ["1day", "1week", "1month"];
        return Promise.all(tfs.map(function (tf) {
          return MSApi.loadTicker(sym, tf)
            .then(function (d) { return { tf: tf, data: d }; })
            .catch(function (e) { return { tf: tf, error: (e && e.message) || "unavailable" }; });
        })).then(function (loaded) {
          var day = loaded[0];
          if (day.error) { return MSWallet.refund(idem).then(function () { MSTierSheet.close(); alert(MSStr.t.tsFailed); }); }
          var dayAn = null;
          tfRuns = loaded.map(function (L) {
            if (L.error) return { tf: L.tf, error: MSStr.t.rpNoHistory };
            try {
              var a = analyzeFull(L.data, true);
              if (L.tf === "1day") dayAn = a;          // 일봉 분석을 두 번 돌리지 않는다
              return { tf: L.tf, out: a.out };
            } catch (e) { return { tf: L.tf, error: MSStr.t.rpNoHistory }; }
          });
          if (!dayAn) { return MSWallet.refund(idem).then(function () { MSTierSheet.close(); alert(MSStr.t.tsFailed); }); }
          data = day.data;
          an = dayAn;
          tier = "full";
          MSTierSheet.close();
          draw();
        });
      });
    }
```

**(e)** `buildTfSection()` 을 실제 값으로 채운다. 함수 전체를 교체:

```js
    function buildTfSection() {
      var sec = MSUi.el("div", "rp-sec");
      sec.appendChild(MSUi.el("div", "rp-sec-title", MSStr.t.rpTf));
      var names = { "1day": MSStr.t.rpDaily, "1week": MSStr.t.rpWeekly, "1month": MSStr.t.rpMonthly };
      if (!tfRuns) {   // Basic — 일봉만 값, 주·월은 잠김
        var dailyVal = "";
        if (state === "ready") {
          var v = an.out.verdict;
          dailyVal = v.confluence.total ? (dirWord(v.regime) + " · " + v.confluence.agree + "/" + v.confluence.total + MSStr.t.rpAgreeShort) : dirWord(v.regime);
        } else if (state === "error") dailyVal = "—";
        sec.appendChild(tfRow(MSStr.t.rpDaily, dailyVal, false, state === "loading"));
        sec.appendChild(tfRow(MSStr.t.rpWeekly, "", true, false));
        sec.appendChild(tfRow(MSStr.t.rpMonthly, "", true, false));
        return sec;
      }
      MSReportModel.tfRows(ForgeCore, tfRuns).forEach(function (r) {
        var val = r.reason ? r.reason
          : (dirWord(r.regime) + (r.prob == null ? "" : " · " + Math.round(r.prob) + "%") +
             (r.target == null ? "" : " · " + MSUi.fmtPrice(r.target)));
        sec.appendChild(tfRow(names[r.tf] || r.tf, val, false, false));
      });
      var ag = MSReportModel.agreeCount(tfRuns);
      sec.appendChild(MSUi.el("div", "rp-range", ag.agree + MSStr.t.rpAgreeTf + ag.total + MSStr.t.rpAgreeTfTail));
      return sec;
    }
```

**(f)** `buildCounted()`·`buildNotCountedSection()` 이 티어를 반영하게 한다.

`buildCounted` 안에서 개수를 찍는 `MSUi.el("span", "rp-sec-count", "5")` 를 아래로 바꾼다:

```js
      title.appendChild(MSUi.el("span", "rp-sec-count", String(tier === "full" ? 32 : 5)));
```

`buildNotCountedSection` 은 **본문을 건드리지 말고 첫 줄에 가드 한 줄만 넣는다**(`var labels = notCountedLabels();` 앞):

```js
      if (tier === "full") return null;   // Full 은 32개를 다 셌다 — 안 센 것이 없다
```

`draw()` 의 `scr.appendChild(buildNotCountedSection());` 을 바꾼다:

```js
      var nc = buildNotCountedSection();
      if (nc) scr.appendChild(nc);
```

> **`buildCounted` 는 Full 에서도 5행만 그린다.** 32행 판독은 지표별 `xSteps` 32종을 부르는 별도 작업이라 이번 범위 밖이다 — 제목의 숫자만 32로 바뀐다. 이 간극을 Task 7 에서 백로그에 남긴다.

- [ ] **Step 4: 관문**

```bash
cd /home/jschoi0223/projects/vdiportal/map/mobile && node --test test/strings.test.mjs 2>&1 | tail -6
cd /home/jschoi0223/projects/vdiportal/map && ./tests/run.sh
cd mobile && node --check www/tier-sheet.js && node --check www/screens/report.js
```

기대: `전체 통과 — 603건`. 죽은 키(`rpSoon` 등)가 잡히면 Step 1 로 돌아가 정리해라.

- [ ] **Step 5: 커밋**

```bash
cd /home/jschoi0223/projects/vdiportal/map && git add mobile/www/tier-sheet.js mobile/www/screens/report.js mobile/www/strings.js mobile/www/index.html
git commit -m "mobile(p8a): 단계 선택 시트 + Full 실행(32지표 × 일·주·월)

차감과 실행이 한 쌍이다 — 일봉이 실패하면 refund, 주·월은 없어도 차감을
유지하고 그 행에 사유를 적는다(신규 상장주는 월봉 5년치가 없다).

차감 미리보기(5 → 2)는 표시 전용 — 진짜 잔량은 백엔드가 돌려준다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: 스타일

**Files:**
- Modify: `map/mobile/www/style.css`

**Interfaces:**
- Consumes: Task 4·5 의 DOM 계약(`.ms-pill`·`.wal-*`·`.sheet-*`·`.wl-scan.is-ico`)

- [ ] **Step 1: 파일 끝의 2단 블록 바로 위에 추가한다**

```css
/* ===== 스쿱 필 — 잔량은 엔진이 아니라 사용자 자산이라 steel 을 쓴다(골드 아님) ===== */
.ms-pill { display:inline-flex; align-items:center; gap:5px; padding:5px 10px; border-radius:99px;
           background:var(--steel-soft); border:1px solid var(--border); color:var(--ink-2);
           font:inherit; font-size:11.5px; font-weight:600; font-variant-numeric:tabular-nums; flex:0 0 auto; }
.ms-pill-ico { color:var(--steel); }
.ms-pill.is-empty .ms-pill-n { min-width:1ch; }

/* Scan 이 아이콘으로 줄었다 — 헤더에 필이 들어와 자리가 없다. 스캔 중에는 텍스트로 늘어난다. */
.wl-scan.is-ico { padding:5px 8px; min-width:30px; justify-content:center; }
.wl-scan.is-ico::after { content:none; }

/* ===== 지갑 ===== */
.wal-head { display:flex; align-items:center; gap:10px; padding:14px 0 6px; }
.wal-cap { margin-left:auto; font-size:11px; color:var(--ink-5); font-variant-numeric:tabular-nums; }
.wal-balance { font-size:48px; font-weight:300; letter-spacing:-.04em; line-height:1.1; padding:2px 0 6px; }
.wal-msg { font-size:12px; color:var(--ink-4); padding-bottom:10px; }
.wal-sec { margin-bottom:22px; }
.wal-row { display:flex; align-items:center; gap:10px; min-height:44px; border-bottom:1px solid var(--hairline); font-size:12.5px; }
.wal-row-name { color:var(--ink-2); font-weight:600; }
.wal-row-note { color:var(--ink-5); font-size:11px; }
.wal-row-amt { margin-left:auto; color:var(--ink-3); font-variant-numeric:tabular-nums; }
.wal-row.is-off { opacity:.55; }

/* ===== 단계 선택 바텀시트(시안 7a) ===== */
.sheet-scrim { position:fixed; inset:0; background:rgba(0,0,0,.55); display:flex; align-items:flex-end; z-index:20; }
.sheet { width:100%; max-height:80vh; overflow-y:auto; background:var(--sheet);
         border-top:1px solid var(--hairline-2); border-radius:16px 16px 0 0; padding:18px 20px calc(20px + env(safe-area-inset-bottom)); }
.sheet-tier { display:flex; align-items:center; gap:12px; width:100%; min-height:64px; padding:10px 0;
              border:0; border-bottom:1px solid var(--hairline); background:none; color:inherit; font:inherit; text-align:left; }
.sheet-tier-id { flex:1 1 auto; min-width:0; }
.sheet-tier-name { display:flex; align-items:center; gap:7px; font-size:13.5px; font-weight:700; }
.sheet-tier-desc { font-size:11.5px; color:var(--ink-5); margin-top:3px; }
/* 선택 표시는 배경으로만 — 좌측 세로 라인 금지 */
.sheet-tier.on { background:var(--steel-soft); }
.sheet-tier.is-off { opacity:.55; }
.sheet-pop { padding:2px 6px; border-radius:4px; background:var(--gold-soft); color:var(--gold); font-size:9.5px; font-weight:700; letter-spacing:.06em; }
.sheet-preview { flex:0 0 auto; font-size:12px; color:var(--ink-3); font-variant-numeric:tabular-nums; }
.sheet-short { font-size:11.5px; color:var(--ink-5); margin:12px 0 0; line-height:1.5; }
.sheet-run { width:100%; margin-top:16px; }
.sheet-run[disabled] { opacity:.5; }
```

- [ ] **Step 2: 관문**

```bash
cd /home/jschoi0223/projects/vdiportal/map && ./tests/run.sh
grep -n "@media" mobile/www/style.css
```

기대: `전체 통과 — 603건`. `@media` 는 주석 언급 외에 **규칙이 없어야** 한다.

- [ ] **Step 3: 커밋**

```bash
cd /home/jschoi0223/projects/vdiportal/map && git add mobile/www/style.css
git commit -m "mobile(p8a): 지갑·필·단계 시트 스타일

스쿱 필은 steel — 잔량은 엔진이 말한 것이 아니라 사용자 자산이라 골드를
쓰지 않는다(삼색 체계). POPULAR 배지만 골드다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: 백로그 + 확인 항목

**Files:**
- Modify: `map/mobile/docs/BACKLOG-mobile.md`

- [ ] **Step 1: 완료 기록을 `## 🔥 다음` 바로 위에 추가한다**

```markdown
- **Phase 8a — 지갑 클라이언트 계약 + UI**(2026-08-12): 스쿱 필 · 지갑 화면 · 단계 선택 시트 ·
  Full 실행(32지표 × 일·주·월).
  - **"재화 체계"는 한 페이즈가 아니었다** — `SPEC-economy.md` 를 읽으니 최소 넷이다(8a 클라이언트 ·
    8b 서버 원장 · 8c 구글 로그인 · 8d AdMob SSV). 8b 는 cafe24 SQLite 확인이, 8d 는 Android 빌드가 선행이다
  - SPEC 이 *"되돌리기 어려운 둘"* 로 지목한 **원장의 위치**와 **보상 경로**를 나중에 붙일 수 있도록,
    클라이언트를 **서버가 이미 있는 것처럼** 짰다 — 비동기·의도 기반, 잔량/델타를 클라이언트가 계산하지 않음,
    모든 `spend` 에 `idem`
  - **⚠️ `wallet-local-stub.js` 는 프로덕션 금지.** `SPEC §1` 이 경고한 상태(클라이언트가 잔량을 든 상태)다.
    **8b 는 이 파일을 '교체'가 아니라 '삭제'한다** — 규칙이 두 벌이면 갈린다(이 저장소가 다섯 번 당한 문제)
  - 스텁이 못 하는 것 둘: 출석 판정이 기기 시계를 쓴다 · 재설치하면 5개를 다시 받는다. 서버 몫이다
  - `scan` 은 무료 — `SPEC` 의 `runType` 목록과 `2c` 의 Spend 목록에 이름만 있고 가격이 시안에 없다
  - 주·월 이력이 없으면(신규 상장주는 월봉 5년치가 없다) 차감을 유지하고 그 행에 사유를 적는다.
    일봉이 실패하면 `refund`
  - 테스트 579 → 603(`map/tests/run.sh`). **엔진 무수정** — `forge-core` 259 · `forge-tools` 81 · `landing` 28 무변동
  - 실기기 육안 확인은 **미실시** — 아래 참조
```

- [ ] **Step 2: 확인 항목을 `## 🔥 다음` 바로 아래에 추가한다**

```markdown
## 미검증 — 사용자 확인 필요 (Phase 8a)

`cd map/mobile/www && python3 -m http.server 8000 --bind 0.0.0.0` 후 폰 Chrome:

1. 워치리스트·리포트 헤더에 스쿱 필이 뜨고 탭하면 지갑이 열린다.
2. `Scan` 이 아이콘(`↻`)으로 줄었는데도 누르기 불편하지 않다. 스캔 중에는 `Scanning 3/6` 로 늘어난다.
3. 지갑에서 출석 체크인이 **하루 1회만** 되고 스트릭이 는다.
4. 리포트의 `Go deeper` 로 시트가 열리고 `5 → 2` 미리보기가 현재 잔량과 맞는다.
5. **Full 실행이 체감상 얼마나 걸리는가** — 미실측. 느리면 시트에 진행 표시를 붙일 것.
6. Full 결과에서 `Not counted` 섹션이 사라지고 예측선 p3 가 보인다.
7. 주기 행이 `Daily`·`Weekly`·`Monthly` 모두 값으로 차고 `N of 3 timeframes agree` 가 맞는다.
8. **월봉 이력이 짧은 종목**(최근 상장주)에서 그 행에 `Not enough history` 가 뜨고 **차감은 유지**된다.
9. 잔량이 부족하면 시트의 실행 버튼이 비활성이고 출석 안내가 뜬다.
10. 2단에서 지갑이 오른쪽 칸에 뜨고 목록이 유지된다.
```

- [ ] **Step 3: 이월 항목을 `📋 예정` 맨 위에 추가한다**

```markdown
- **8b 서버 원장** — SQLite `accounts`/`ledger`/`ad_grants`/`runs` + `forge-api.php` 의 `wallet.get`/`wallet.spend`/
  `wallet.checkin` + 멱등. **cafe24 SQLite(PDO) 가용 여부 확인이 선행.** 이때 `wallet-local-stub.js` 를 **삭제**한다.
- **8c 구글 로그인 + 익명 계정 병합** — `device_id` 계정을 구글 계정에 합칠 때 높은 잔량·긴 스트릭을 취하고
  병합 원장 줄을 남긴다(`SPEC §4`). 재설치로 5개를 다시 받는 구멍도 여기서 막힌다.
- **8d AdMob SSV** — 광고 유닛 2종(Quick 15초 +1 · Full 30초 +3) · 서명 검증 · `transaction_id` 중복 제거.
  **Android 빌드가 한 번도 안 돌았다.** 지갑 화면의 광고 두 줄은 그때까지 비활성이다.
- **`Counted` 가 Full 에서도 5행이다** — 제목 숫자만 32로 바뀐다. 32종 판독 문구는 지표별 `xSteps` 를
  32번 부르는 별도 작업이라 8a 범위 밖으로 뒀다. 시안 4a 의 *"What the 27 added"* 가 이 자리다.
- **`scan` 가격 미정** — `SPEC §1` 의 `runType` 과 `2c` 의 Spend 목록에 이름만 있고 값이 없다. 무료로 뒀다.
- **Custom 티어**(5스쿱) — 시트에 자리만 있고 비활성. 화면군 자체가 v4.
```

- [ ] **Step 4: 관문 + 커밋**

```bash
cd /home/jschoi0223/projects/vdiportal/map && ./tests/run.sh
git add mobile/docs/BACKLOG-mobile.md
git commit -m "mobile(p8a): Phase 8a 종료 문서 + 확인 10항목

재화 체계가 최소 넷의 하위 프로젝트였다는 것이 이번의 핵심 발견.
스텁 삭제 조건을 8b 항목에 명시.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

기대: `전체 통과 — 603건`.

---

## 완료 조건

- `./tests/run.sh` 통과, **603건**(forge-core 259 · forge-tools 81 · landing 28 · moneyscoop-mobile 235)
- `forge-core` · `forge-tools` · `landing` 무변동 — 엔진을 건드리지 않는다
- `grep -rn "balance -\|balance +" mobile/www/screens mobile/www/tier-sheet.js` 가 **시트의 표시 전용 미리보기 한 곳만** 잡는다 — 그 외에 클라이언트가 잔량을 계산하는 곳이 없어야 한다
- `grep -n "@media" mobile/www/style.css` 가 규칙을 잡지 않는다
- 커밋 7개
- **실기기 확인 10항목은 미검증 상태로 백로그에 남는다**
