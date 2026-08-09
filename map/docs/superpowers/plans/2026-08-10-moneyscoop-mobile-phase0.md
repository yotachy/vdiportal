# 머니스쿱 모바일 Phase 0 — 폰에서 도는 APK Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 스쿱포지 엔진(`forge-core.js`)이 무수정으로 안드로이드 WebView에서 돌아가는 것을 갤럭시 Z폴드7에 설치된 APK로 증명하고, Web Worker 도입 여부를 판정할 실측치를 남긴다.

**Architecture:** `map/mobile/`에 번들러 없는 정적 웹앱을 만들고 Capacitor로 감싼다. 엔진은 `map/forge-core.js` 원본을 빌드 시점에 `www/vendor/`로 복사한다(커밋하지 않는 생성물이라 두 벌이 존재할 수 없다). 순수 로직(정규화·기하·측정)은 UMD 모듈로 분리해 `node --test`로 검증하고, 기기 검증은 증거를 기록으로 남긴다.

**Tech Stack:** Vanilla JS(UMD, ES5 문법 불요 — WebView는 최신 Chromium) · Canvas 2D · Capacitor 7 · `node --test` · Android Studio(Windows)

## 선행 조사 결과 (이미 확인됨 — 다시 조사하지 말 것)

| 항목 | 실측 결과 |
|---|---|
| **CORS** | **이미 열려 있다.** `forge-api.php:4-9`가 `Access-Control-Allow-Origin: *` + OPTIONS 204. 라이브 서버(`https://parksvc.mycafe24.com/map/forge-api.php`)에서 `Origin: https://localhost`로 실측 확인. **PHP를 고칠 필요가 없다** |
| OHLC 계약 | `GET ?ohlc=1&symbol=AAPL&tf=1day[&since=YYYY-MM-DD]` → `{ok, symbol, tf, source, name, full, candles:[{t,o,h,l,c,v}]}` |
| 엔진 호출 | `ForgeCore.run(graph, {price, candle}, {futW, timeframe})` |
| 엔진 출력 | `{values, meta, prediction, signal, verdict}` · `prediction{path[],lo[],hi[],anchor,target,futW,...}` · `verdict{regime,score,target,invalidation,confluence{score,agree,total},context}` |
| `sampleGraph()` | 24노드 / **지표 19종**. 32종이 아니다 — 13종을 추가해야 Full 측정이 된다 |
| 누락 13종 | `pivot psar gann keltner donchian cci williams aroon mfi roc ao cmf pattern` |
| 노드 스키마 | `{id, kind:"block", blockType, params:{}, x, y, title, conviction, weight}` · 엣지 `{from, to}` |
| **성능 기준선** | 봉 수와 **무관**하게 일정(엔진이 최근 구간만 본다). 5000봉 ≈ 600봉. 데스크톱 노드: 19지표 1TF 70.6ms · **32지표 1TF 86.5ms · 32지표×3TF 202.8ms** |
| 6배 스로틀 환산 | **1.22초** — 판정 임계 2초 아래. Worker 불필요 쪽으로 기운다(기기 실측으로 확정) |
| sudo | **불가**(비밀번호 필요). WSL에 JDK를 apt로 설치할 수 없다 → 빌드는 Windows Android Studio에서 |
| Windows 자산 | Android Studio JBR · Android SDK · `adb.exe` 모두 존재 |
| 배포 스크립트 | 저장소에 없음(수동 SFTP). `map/mobile/`이 자동으로 서버에 올라갈 위험 없음 |

## Global Constraints

- **번들러·프레임워크 금지.** `www/` 안은 classic `<script>` + UMD 모듈만. `defer`/`async` 금지, 로드 순서 고정
- **엔진 무수정.** 수정은 `map/forge-core.js`·`forge-tools.js` 원본에서만. `www/vendor/`는 커밋하지 않는 생성물
- 엔진을 건드렸다면 `node --test forge-core.test.js`(251건) · `node --test forge-tools.test.js`(81건)가 전부 통과해야 한다
- 커밋 스코프는 `mobile(...)`. 포지 백로그(`map/docs/BACKLOG.md`)에 적지 않는다 — `map/mobile/docs/BACKLOG-mobile.md`가 별도 출처
- **`map/mobile/`은 cafe24 `www/map/`에 절대 업로드하지 않는다** (앱은 스토어 배포)
- `capacitor.config.json`의 `server.androidScheme`는 **`"https"`** (커스텀 스킴을 insecure로 취급하는 API·쿠키 동작 회피)
- 색은 핸드오프 토큰만: `bg #0a0d12` · `ink #eef1f7` · `ink-4 #7c8598` · `ink-5 #78819a`(**텍스트 최저 대비 — 이보다 밝게 가지 말 것**) · `gold #e8b463` · `bull #4fb98a` · `bear #d96a6a`
- **좌측 세로 컬러 라인(accent bar) 금지** — 저장소 전역 규칙
- Phase 0의 UI는 **측정 하네스**다. 디자인 충실도·제스처·축 라벨은 Phase 1 몫이며 여기서 만들지 않는다
- **`mobile/package.json`에 `"type": "module"`을 넣지 말 것.** 넣으면 `www/*.js`의 UMD 래퍼가 CommonJS 분기를 못 타고 `root.MSApi = ...`로 떨어지는데, ESM 최상위 `this`는 `undefined`라 `TypeError: Cannot set properties of undefined`로 죽는다(Node 24 실측). 테스트만 `.mjs` 확장자로 두어 ESM 으로 쓰고, `www/*.js`는 기본 CommonJS 로 남긴다
- 테스트는 **`node --test test/*.test.mjs`** 형태로 돌린다. `node --test test/`(디렉토리)는 Node 24 에서 인자를 모듈 경로로 해석해 `MODULE_NOT_FOUND`로 죽는다(실측)

---

## File Structure

```
map/.gitignore                     수정 — mobile 생성물 제외
map/mobile/
  package.json                     생성 — npm 스크립트(sync·test·cap)
  capacitor.config.json            생성 — Task 5
  sync-engine.mjs                  생성 — 엔진 원본 → www/vendor 복사 + SHA 매니페스트
  www/
    index.html                     생성 — 스파이크 화면
    style.css                      생성 — 최소 스타일
    api.js                         생성 — UMD `MSApi`: ohlcUrl · normalizeCandles
    graph.js                       생성 — UMD `MSGraph`: full32Graph
    chart.js                       생성 — UMD `MSChart`: chartGeometry · drawChart
    bench.js                       생성 — UMD `MSBench`: measure
    spike.js                       생성 — 화면 배선(테스트 없음, 순수 로직 없음)
    vendor/                        생성물(gitignore)
  test/
    sync.test.mjs                  생성
    api.test.mjs                   생성
    graph.test.mjs                 생성
    chart.test.mjs                 생성
    bench.test.mjs                 생성
  docs/
    BACKLOG-mobile.md              생성 — 모바일 전용 백로그
    phase0-measurements.md         생성 — Task 6에서 실측 기록
  android/                         생성 — Task 5(`cap add android`)
```

책임 분리 원칙: `api.js`는 서버 응답을 엔진 입력으로 바꾸는 일만, `graph.js`는 전략 그래프 구성만, `chart.js`는 좌표와 페인트만, `bench.js`는 시간 측정만 한다. `spike.js`만 이들을 배선하며 순수 로직을 갖지 않는다 — 그래서 테스트가 없다.

---

### Task 1: 스캐폴드 + 엔진 동기화 스크립트

엔진이 두 벌 존재할 수 없게 만드는 장치. 여기서 틀어지면 나머지 전부가 잘못된 엔진 위에 쌓인다.

**Files:**
- Create: `map/mobile/package.json`
- Create: `map/mobile/sync-engine.mjs`
- Create: `map/mobile/test/sync.test.mjs`
- Create: `map/mobile/docs/BACKLOG-mobile.md`
- Modify: `map/.gitignore` (끝에 추가)

**Interfaces:**
- Consumes: 없음
- Produces: `syncEngine(srcDir, destDir) -> { "forge-core.js": "<sha12>", "forge-tools.js": "<sha12>" }` · 상수 `ENGINE_FILES: string[]` · `www/vendor/ENGINE-VERSION.json`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`map/mobile/test/sync.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert";
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { syncEngine, ENGINE_FILES } from "../sync-engine.mjs";

function tmp(p) { return mkdtempSync(join(tmpdir(), p)); }

test("원본을 바이트 동일하게 복사하고 SHA 매니페스트를 남긴다", () => {
  const src = tmp("ms-src-"), dst = tmp("ms-dst-");
  for (const f of ENGINE_FILES) writeFileSync(join(src, f), "// " + f + "\n비ASCII\u0000\u00ff");

  const manifest = syncEngine(src, dst);

  for (const f of ENGINE_FILES) {
    assert.deepEqual(readFileSync(join(dst, f)), readFileSync(join(src, f)), f + " 바이트 불일치");
    assert.match(manifest[f], /^[0-9a-f]{12}$/, f + " SHA 형식");
  }
  assert.ok(existsSync(join(dst, "ENGINE-VERSION.json")));
  assert.deepEqual(JSON.parse(readFileSync(join(dst, "ENGINE-VERSION.json"), "utf8")), manifest);
});

test("내용이 바뀌면 SHA도 바뀐다", () => {
  const src = tmp("ms-src-"), dst = tmp("ms-dst-");
  for (const f of ENGINE_FILES) writeFileSync(join(src, f), "A");
  const a = syncEngine(src, dst);
  for (const f of ENGINE_FILES) writeFileSync(join(src, f), "B");
  const b = syncEngine(src, dst);
  assert.notEqual(a[ENGINE_FILES[0]], b[ENGINE_FILES[0]]);
});

test("원본이 없으면 조용히 넘어가지 않고 던진다", () => {
  assert.throws(() => syncEngine(tmp("ms-src-"), tmp("ms-dst-")), /엔진 원본 없음/);
});
```

- [ ] **Step 2: 실패를 확인한다**

```bash
cd map/mobile && node --test test/sync.test.mjs
```
Expected: FAIL — `Cannot find module '../sync-engine.mjs'`

- [ ] **Step 3: 최소 구현**

`map/mobile/sync-engine.mjs`:

```js
// 엔진 원본(map/forge-*.js) → www/vendor/ 복사. vendor 는 커밋하지 않는 생성물이라
// 엔진이 두 벌 존재할 수 없다. cap sync 앞에 자동 실행된다(package.json).
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const ENGINE_FILES = ["forge-core.js", "forge-tools.js"];

export function syncEngine(srcDir, destDir) {
  mkdirSync(destDir, { recursive: true });
  const manifest = {};
  for (const f of ENGINE_FILES) {
    const src = join(srcDir, f);
    if (!existsSync(src)) throw new Error("엔진 원본 없음: " + src);
    const buf = readFileSync(src);
    writeFileSync(join(destDir, f), buf);
    manifest[f] = createHash("sha256").update(buf).digest("hex").slice(0, 12);
  }
  writeFileSync(join(destDir, "ENGINE-VERSION.json"), JSON.stringify(manifest, null, 2) + "\n");
  return manifest;
}

const here = dirname(fileURLToPath(import.meta.url));
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const m = syncEngine(join(here, ".."), join(here, "www", "vendor"));
  for (const [f, sha] of Object.entries(m)) console.log("  " + f + "  " + sha);
}
```

`map/mobile/package.json`:

```json
{
  "name": "moneyscoop-mobile",
  "version": "0.0.1",
  "private": true,
  "description": "머니스쿱 모바일 — 스쿱포지 엔진 기반 하이브리드 앱",
  "scripts": {
    "sync": "node sync-engine.mjs",
    "test": "node --test test/*.test.mjs",
    "cap:sync": "npm run sync && npx cap sync android"
  }
}
```

`"type"` 필드가 **없는 것이 의도**다(Global Constraints 참고). 있으면 `www/*.js`의 UMD 가 ESM 으로 해석돼 `TypeError: Cannot set properties of undefined (setting 'MSApi')`로 죽는다. 테스트만 `.mjs` 로 두어 ESM 을 쓴다.

`map/.gitignore` 끝에 추가:

```
# 머니스쿱 모바일 — 생성물(엔진 사본은 sync-engine.mjs 가 만든다)
mobile/node_modules/
mobile/www/vendor/
mobile/android/build/
mobile/android/app/build/
mobile/android/.gradle/
mobile/android/local.properties
mobile/android/app/src/main/assets/public/
```

`map/mobile/docs/BACKLOG-mobile.md`:

```markdown
# 머니스쿱 모바일 백로그 (살아있는 문서)

> 스쿱포지 백로그(`map/docs/BACKLOG.md`)와 **섞지 않는다.** 목적·사용자·배포 대상이 다르다.
> 설계: `map/docs/superpowers/specs/2026-08-10-moneyscoop-mobile-design.md`

## 🔥 진행 중

- **Phase 0 — 폰에서 도는 APK** (`docs/superpowers/plans/2026-08-10-moneyscoop-mobile-phase0.md`)

## 📋 예정

- Phase 1 — 수직 슬라이스(워치리스트 → Basic 리포트 → 차트)
- v2 — 서버 지갑 원장 + 구글 로그인
- v3 — AdMob + SSV + Full 티어 → 프로덕션 출시
- v4 — Custom 티어 · 증거/신뢰 화면군
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
cd map/mobile && node --test test/sync.test.mjs
```
Expected: PASS (3건)

- [ ] **Step 5: 실제 엔진으로 한 번 돌려본다**

```bash
cd map/mobile && npm run sync && ls -la www/vendor/ && cat www/vendor/ENGINE-VERSION.json
```
Expected: `forge-core.js`(약 207KB) · `forge-tools.js`(약 70KB) · `ENGINE-VERSION.json`에 12자리 SHA 2개

- [ ] **Step 6: vendor 가 커밋 대상이 아닌지 확인**

```bash
cd map && git status --short mobile/
```
Expected: `mobile/www/vendor/`가 목록에 **없어야** 한다

- [ ] **Step 7: 커밋**

```bash
cd /home/jschoi0223/projects/vdiportal
git add map/.gitignore map/mobile/package.json map/mobile/sync-engine.mjs map/mobile/test/sync.test.mjs map/mobile/docs/BACKLOG-mobile.md
git commit -m "mobile(phase0): 스캐폴드 + 엔진 동기화 스크립트

vendor/ 를 커밋하지 않는 생성물로 두어 엔진이 두 벌 존재할 수 없게 한다.
sync.test.mjs 3건.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: OHLC 응답 → 엔진 입력 정규화

**Files:**
- Create: `map/mobile/www/api.js`
- Create: `map/mobile/test/api.test.mjs`

**Interfaces:**
- Consumes: Task 1의 npm 스크립트
- Produces: 전역 `MSApi` = `{ API_BASE: string, MIN_BARS: {[tf]: number}, ohlcUrl(symbol, tf, since?) -> string, normalizeCandles(json) -> {price: number[], candle: {o,h,l,c,v}[], asOf: string, source: string, name: string} }`. 실패 시 `Error` throw

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`map/mobile/test/api.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const MSApi = require("../www/api.js");

function fakeResponse(n, over) {
  const candles = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(Date.UTC(2020, 0, 1 + i));
    candles.push({ t: d.toISOString().slice(0, 10), o: 100 + i, h: 102 + i, l: 99 + i, c: 101 + i, v: 1000 + i });
  }
  return Object.assign({ ok: true, symbol: "AAPL", tf: "1day", source: "twelvedata", name: "Apple", full: true, candles }, over);
}

test("ohlcUrl 은 심볼을 인코딩하고 since 는 있을 때만 붙인다", () => {
  assert.equal(MSApi.ohlcUrl("AAPL", "1day"),
    MSApi.API_BASE + "?ohlc=1&symbol=AAPL&tf=1day");
  assert.equal(MSApi.ohlcUrl("BTC/USD", "1week", "2026-01-31"),
    MSApi.API_BASE + "?ohlc=1&symbol=BTC%2FUSD&tf=1week&since=2026-01-31");
});

test("ohlcUrl 은 tf 를 생략하면 1day 로 떨어진다", () => {
  assert.match(MSApi.ohlcUrl("AAPL"), /tf=1day$/);
});

test("normalizeCandles 는 문자열 수치를 숫자로 바꾼다", () => {
  const r = fakeResponse(250);
  r.candles[0].o = "100";  r.candles[0].c = "101";
  const out = MSApi.normalizeCandles(r);
  assert.strictEqual(out.candle[0].o, 100);
  assert.strictEqual(out.candle[0].c, 101);
  assert.strictEqual(out.price[0], 101);
  assert.equal(out.price.length, 250);
});

test("거래량이 null 이면 undefined 로 둔다 — 0 으로 바꾸면 mfi·cmf 가 오염된다", () => {
  const r = fakeResponse(250);
  r.candles[5].v = null;
  const out = MSApi.normalizeCandles(r);
  assert.strictEqual(out.candle[5].v, undefined);
  assert.strictEqual(out.candle[6].v, 1006);
});

test("asOf 는 마지막 봉 날짜 10자리", () => {
  const r = fakeResponse(250);
  r.candles[249].t = "2026-08-07T00:00:00Z";
  assert.equal(MSApi.normalizeCandles(r).asOf, "2026-08-07");
});

test("ok:false 면 서버 error 를 담아 던진다", () => {
  assert.throws(() => MSApi.normalizeCandles({ ok: false, error: "notfound" }), /notfound/);
});

test("봉이 부족하면 던진다 — 주기별 하한이 다르다", () => {
  assert.throws(() => MSApi.normalizeCandles(fakeResponse(219, { tf: "1day" })), /봉 부족/);
  assert.doesNotThrow(() => MSApi.normalizeCandles(fakeResponse(220, { tf: "1day" })));
  assert.throws(() => MSApi.normalizeCandles(fakeResponse(59, { tf: "1month" })), /봉 부족/);
  assert.doesNotThrow(() => MSApi.normalizeCandles(fakeResponse(60, { tf: "1month" })));
});

test("candles 가 배열이 아니면 던진다", () => {
  assert.throws(() => MSApi.normalizeCandles({ ok: true, tf: "1day", candles: null }), /봉 부족/);
});
```

- [ ] **Step 2: 실패를 확인한다**

```bash
cd map/mobile && node --test test/api.test.mjs
```
Expected: FAIL — `Cannot find module '../www/api.js'`

- [ ] **Step 3: 최소 구현**

`map/mobile/www/api.js`:

```js
// forge-api.php OHLC 프록시 클라이언트. 서버 응답을 ForgeCore.run 의 data 인자로 바꾸는 것만 한다.
// CORS 는 서버가 이미 열어 두었다(forge-api.php:4-9, 라이브 실측 확인) — 클라이언트에서 할 일 없음.
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.MSApi = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var API_BASE = "https://parksvc.mycafe24.com/map/forge-api.php";

  // 주기별 최소 봉 수. 일봉 220 은 PC 신호 스캔과 같은 기준(forge-app.js scanAlerts).
  // 주·월봉은 같은 기준을 쓰면 신생 종목이 전부 막히므로 낮춘다 — 어떤 지표가 실제로
  // 열화하는지는 Phase 1 에서 측정해 조정한다.
  var MIN_BARS = { "1day": 220, "1week": 120, "1month": 60 };

  function ohlcUrl(symbol, tf, since) {
    tf = tf || "1day";
    var u = API_BASE + "?ohlc=1&symbol=" + encodeURIComponent(symbol) + "&tf=" + encodeURIComponent(tf);
    if (since) u += "&since=" + encodeURIComponent(since);
    return u;
  }

  function normalizeCandles(json) {
    if (!json || !json.ok) throw new Error("OHLC 실패: " + ((json && json.error) || "unknown"));
    var raw = json.candles;
    var floor = MIN_BARS[json.tf] || MIN_BARS["1day"];
    if (!Array.isArray(raw) || raw.length < floor) {
      throw new Error("봉 부족: " + (Array.isArray(raw) ? raw.length : 0) + " < " + floor + " (" + (json.tf || "1day") + ")");
    }
    var candle = raw.map(function (c) {
      return {
        o: +c.o, h: +c.h, l: +c.l, c: +c.c,
        // null 을 0 으로 바꾸면 거래량 기반 지표(mfi·cmf)가 오염된다. 없으면 없는 채로 넘긴다.
        v: (c.v != null && isFinite(+c.v)) ? +c.v : undefined
      };
    });
    return {
      price: candle.map(function (c) { return c.c; }),
      candle: candle,
      asOf: String(raw[raw.length - 1].t || "").slice(0, 10),
      source: json.source || "",
      name: json.name || json.symbol || ""
    };
  }

  return { API_BASE: API_BASE, MIN_BARS: MIN_BARS, ohlcUrl: ohlcUrl, normalizeCandles: normalizeCandles };
});
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
cd map/mobile && node --test test/api.test.mjs
```
Expected: PASS (8건)

- [ ] **Step 5: 라이브 서버로 계약 확인**

```bash
cd map/mobile && node -e '
const MSApi = require("./www/api.js");
fetch(MSApi.ohlcUrl("AAPL","1day")).then(r=>r.json()).then(j=>{
  const o = MSApi.normalizeCandles(j);
  console.log("봉", o.candle.length, "· asOf", o.asOf, "· source", o.source, "· 마지막 종가", o.price[o.price.length-1]);
});'
```
Expected: 봉 수 4000 이상 · `asOf`가 최근 거래일 · `source`는 `twelvedata` 또는 `yahoo`

- [ ] **Step 6: 커밋**

```bash
cd /home/jschoi0223/projects/vdiportal
git add map/mobile/www/api.js map/mobile/test/api.test.mjs
git commit -m "mobile(phase0): OHLC 응답 정규화 — 주기별 최소 봉 수·거래량 null 보존

거래량 null 을 0 으로 바꾸면 mfi·cmf 가 오염되므로 undefined 로 둔다.
api.test.mjs 8건.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: 32지표 전략 그래프 구성

`sampleGraph()`는 지표가 19종뿐이다. Full 티어 성능을 재려면 나머지 13종을 붙여야 한다.

**Files:**
- Create: `map/mobile/www/graph.js`
- Create: `map/mobile/test/graph.test.mjs`

**Interfaces:**
- Consumes: `ForgeCore.sampleGraph()` · `ForgeCore.indicatorCount`
- Produces: 전역 `MSGraph` = `{ MISSING: string[], INFRA: string[], full32Graph(ForgeCore) -> {nodes, edges}, indicatorTypes(graph) -> string[] }`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`map/mobile/test/graph.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const MSGraph = require("../www/graph.js");
const ForgeCore = require("../../forge-core.js");

test("full32Graph 의 지표 노드 수가 엔진의 indicatorCount 와 같다", () => {
  const g = MSGraph.full32Graph(ForgeCore);
  const inds = MSGraph.indicatorTypes(g);
  assert.equal(inds.length, ForgeCore.indicatorCount, "지표 " + inds.length + "종 ≠ 엔진 " + ForgeCore.indicatorCount + "종");
});

test("지표 종류에 중복이 없다", () => {
  const inds = MSGraph.indicatorTypes(MSGraph.full32Graph(ForgeCore));
  assert.equal(new Set(inds).size, inds.length);
});

test("원본 sampleGraph 를 변형하지 않는다", () => {
  const before = JSON.stringify(ForgeCore.sampleGraph());
  MSGraph.full32Graph(ForgeCore);
  assert.equal(JSON.stringify(ForgeCore.sampleGraph()), before);
});

test("추가한 노드는 price 를 먹고 combine 으로 나간다", () => {
  const g = MSGraph.full32Graph(ForgeCore);
  const price = g.nodes.find(n => n.blockType === "price");
  const comb = g.nodes.find(n => n.blockType === "combine");
  for (const bt of MSGraph.MISSING) {
    const node = g.nodes.find(n => n.blockType === bt);
    assert.ok(node, bt + " 노드 없음");
    assert.ok(g.edges.some(e => e.from === price.id && e.to === node.id), bt + " ← price 엣지 없음");
    assert.ok(g.edges.some(e => e.from === node.id && e.to === comb.id), bt + " → combine 엣지 없음");
  }
});

test("conviction 을 0 으로 눕혀 시연용 확신값이 판정에 섞이지 않게 한다", () => {
  const g = MSGraph.full32Graph(ForgeCore);
  assert.ok(g.nodes.every(n => !n.conviction), "conviction 잔존");
});

test("엔진이 이 그래프로 실제로 돈다", () => {
  const g = MSGraph.full32Graph(ForgeCore);
  const d = ForgeCore.makeDemoSeries(800);
  const res = ForgeCore.run(g, d, { futW: 60, timeframe: "1day" });
  assert.ok(res.verdict, "verdict 없음");
  assert.ok(Number.isFinite(res.verdict.score));
  assert.equal(res.prediction.path.length, 60);
  assert.ok(res.verdict.confluence.total >= 20, "합류 표본이 19지표 수준 — 추가 노드가 반영되지 않았다");
});
```

- [ ] **Step 2: 실패를 확인한다**

```bash
cd map/mobile && node --test test/graph.test.mjs
```
Expected: FAIL — `Cannot find module '../www/graph.js'`

- [ ] **Step 3: 최소 구현**

`map/mobile/www/graph.js`:

```js
// Full 티어(32지표) 전략 그래프. sampleGraph() 는 지표가 19종뿐이라 13종을 덧붙인다.
// 노드 스키마: {id, kind:"block", blockType, params:{}, x, y, title, conviction, weight}
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.MSGraph = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // 지표가 아닌 블록 — 지표 개수를 셀 때 제외한다.
  var INFRA = ["ticker", "price", "combine", "predict"];

  // sampleGraph 에 없는 13종(IND_TIERS 32종 − sampleGraph 19종).
  var MISSING = ["pivot", "psar", "gann", "keltner", "donchian", "cci",
                 "williams", "aroon", "mfi", "roc", "ao", "cmf", "pattern"];

  function indicatorTypes(graph) {
    var seen = [];
    (graph.nodes || []).forEach(function (n) {
      if (!n.blockType || INFRA.indexOf(n.blockType) >= 0) return;
      if (seen.indexOf(n.blockType) < 0) seen.push(n.blockType);
    });
    return seen;
  }

  function full32Graph(ForgeCore) {
    // 깊은 복사 — sampleGraph 는 호출마다 새 객체를 주지만, 캐시로 바뀌어도 안전하도록.
    var g = JSON.parse(JSON.stringify(ForgeCore.sampleGraph()));
    // 시연용 확신값이 판정에 섞이면 측정치가 그래프 구성이 아니라 하드코딩 값을 반영한다.
    g.nodes.forEach(function (n) { n.conviction = 0; });

    var price = g.nodes.find(function (n) { return n.blockType === "price"; });
    var comb = g.nodes.find(function (n) { return n.blockType === "combine"; });
    if (!price || !comb) throw new Error("sampleGraph 구조 변경 — price/combine 노드를 찾을 수 없다");

    var have = indicatorTypes(g);
    MISSING.forEach(function (bt, i) {
      if (have.indexOf(bt) >= 0) return;   // 엔진이 sampleGraph 에 추가했다면 건너뛴다
      var id = "m_" + bt;
      g.nodes.push({ id: id, kind: "block", blockType: bt, params: {},
                     x: 620, y: i * 70, title: bt, conviction: 0, weight: 50 });
      g.edges.push({ from: price.id, to: id }, { from: id, to: comb.id });
    });
    return g;
  }

  return { INFRA: INFRA, MISSING: MISSING, indicatorTypes: indicatorTypes, full32Graph: full32Graph };
});
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
cd map/mobile && node --test test/graph.test.mjs
```
Expected: PASS (6건)

- [ ] **Step 5: 커밋**

```bash
cd /home/jschoi0223/projects/vdiportal
git add map/mobile/www/graph.js map/mobile/test/graph.test.mjs
git commit -m "mobile(phase0): 32지표 전략 그래프 — sampleGraph(19종)에 13종 추가

지표 수를 ForgeCore.indicatorCount 와 대조하는 테스트를 둬서
엔진이 지표를 늘리면 여기가 먼저 깨지게 한다. graph.test.mjs 6건.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: 차트 기하 + 페인트

**Files:**
- Create: `map/mobile/www/chart.js`
- Create: `map/mobile/test/chart.test.mjs`

**Interfaces:**
- Consumes: `normalizeCandles`의 `candle[]` · `ForgeCore.run`의 `prediction{path,lo,hi}`
- Produces: 전역 `MSChart` = `{ chartGeometry(opts) -> Geo, drawChart(ctx, geo, colors) -> void }`
  - `opts`: `{candle, prediction, width, height, pad?, tailBars?}`
  - `Geo`: `{bars: {x,yO,yH,yL,yC,up}[], cone: {hi: {x,y}[], lo: {x,y}[]}, path: {x,y}[], bw, min, max, tail, fut}`
  - `colors`: `{bull, bear, gold, cone}`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`map/mobile/test/chart.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const MSChart = require("../www/chart.js");

const COL = { bull: "#4fb98a", bear: "#d96a6a", gold: "#e8b463", cone: "rgba(232,180,99,.09)" };

function candles(n, flat) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const base = flat ? 100 : 100 + i;
    out.push({ o: base, h: base + 2, l: base - 1, c: base + (i % 2 ? 1 : -1), v: 1000 });
  }
  return out;
}
function prediction(n) {
  const path = [], lo = [], hi = [];
  for (let i = 0; i < n; i++) { path.push(200 + i); lo.push(195 + i); hi.push(205 + i); }
  return { path, lo, hi, futW: n, anchor: 200, target: 200 + n };
}

// 캔버스는 반환값이 아니라 실제 페인트를 단언해야 한다(스와치가 반환값엔 반영됐지만
// 페인트엔 안 됐던 forge-tools 사고). 호출을 그대로 기록하는 심을 쓴다.
function recCtx() {
  const calls = [];
  const st = { fillStyle: null, strokeStyle: null, lineWidth: null };
  const rec = name => (...args) => calls.push({ op: name, args, fill: st.fillStyle, stroke: st.strokeStyle, lw: st.lineWidth });
  const ctx = {
    save: rec("save"), restore: rec("restore"), beginPath: rec("beginPath"), closePath: rec("closePath"),
    moveTo: rec("moveTo"), lineTo: rec("lineTo"), fill: rec("fill"), stroke: rec("stroke"), fillRect: rec("fillRect")
  };
  for (const k of ["fillStyle", "strokeStyle", "lineWidth"]) {
    Object.defineProperty(ctx, k, { get: () => st[k], set: v => { st[k] = v; } });
  }
  ctx.calls = calls;
  return ctx;
}

test("bars 는 tailBars 만큼만, 오래된 것부터 잘라낸다", () => {
  const g = MSChart.chartGeometry({ candle: candles(300), prediction: prediction(60), width: 372, height: 240, tailBars: 120 });
  assert.equal(g.bars.length, 120);
  assert.equal(g.tail, 120);
  assert.equal(g.fut, 60);
});

test("가격 최고/최저가 패딩 경계에 매핑된다", () => {
  const g = MSChart.chartGeometry({ candle: candles(50), prediction: null, width: 300, height: 200, pad: 10, tailBars: 50 });
  const yTop = Math.min(...g.bars.map(b => b.yH));
  const yBot = Math.max(...g.bars.map(b => b.yL));
  assert.ok(Math.abs(yTop - 10) < 0.001, "최고가 y=" + yTop);
  assert.ok(Math.abs(yBot - 190) < 0.001, "최저가 y=" + yBot);
});

test("콘의 hi/lo 가 스케일에 포함된다 — 예측이 화면 밖으로 나가지 않는다", () => {
  const g = MSChart.chartGeometry({ candle: candles(50), prediction: prediction(60), width: 300, height: 200, pad: 10, tailBars: 50 });
  const ys = g.cone.hi.concat(g.cone.lo).map(p => p.y);
  assert.ok(Math.min(...ys) >= 10 - 0.001 && Math.max(...ys) <= 190 + 0.001);
});

test("예측 경로는 마지막 봉 오른쪽에서 시작한다", () => {
  const g = MSChart.chartGeometry({ candle: candles(50), prediction: prediction(60), width: 300, height: 200, tailBars: 50 });
  assert.ok(g.path[0].x > g.bars[g.bars.length - 1].x);
  assert.equal(g.path.length, 60);
});

test("완전 평탄한 시리즈에서 NaN 이 나오지 않는다", () => {
  const g = MSChart.chartGeometry({ candle: candles(30, true).map(c => ({ o: 100, h: 100, l: 100, c: 100 })), prediction: null, width: 300, height: 200 });
  assert.ok(g.bars.every(b => Number.isFinite(b.yO) && Number.isFinite(b.yC) && Number.isFinite(b.yH) && Number.isFinite(b.yL)));
});

test("예측이 없어도 동작한다", () => {
  const g = MSChart.chartGeometry({ candle: candles(50), prediction: null, width: 300, height: 200 });
  assert.equal(g.fut, 0);
  assert.equal(g.path.length, 0);
  assert.equal(g.cone.hi.length, 0);
});

test("drawChart 가 콘을 cone 색으로 실제로 채운다", () => {
  const g = MSChart.chartGeometry({ candle: candles(50), prediction: prediction(60), width: 300, height: 200 });
  const ctx = recCtx();
  MSChart.drawChart(ctx, g, COL);
  assert.ok(ctx.calls.some(c => c.op === "fill" && c.fill === COL.cone), "콘 fill 이 cone 색으로 실행되지 않았다");
});

test("drawChart 가 상승봉을 bull, 하락봉을 bear 로 실제로 칠한다", () => {
  const g = MSChart.chartGeometry({ candle: candles(50), prediction: null, width: 300, height: 200 });
  const ctx = recCtx();
  MSChart.drawChart(ctx, g, COL);
  const rects = ctx.calls.filter(c => c.op === "fillRect");
  assert.equal(rects.length, g.bars.length, "몸통 개수 불일치");
  assert.ok(rects.some(r => r.fill === COL.bull), "bull 색 몸통 없음");
  assert.ok(rects.some(r => r.fill === COL.bear), "bear 색 몸통 없음");
});

test("drawChart 가 예측 경로를 gold 로 스트로크한다", () => {
  const g = MSChart.chartGeometry({ candle: candles(50), prediction: prediction(60), width: 300, height: 200 });
  const ctx = recCtx();
  MSChart.drawChart(ctx, g, COL);
  assert.ok(ctx.calls.some(c => c.op === "stroke" && c.stroke === COL.gold), "예측 경로 gold 스트로크 없음");
});

test("몸통 높이는 최소 1px — 도지가 사라지지 않는다", () => {
  const doji = Array.from({ length: 30 }, () => ({ o: 100, h: 101, l: 99, c: 100 }));
  const g = MSChart.chartGeometry({ candle: doji, prediction: null, width: 300, height: 200 });
  const ctx = recCtx();
  MSChart.drawChart(ctx, g, COL);
  assert.ok(ctx.calls.filter(c => c.op === "fillRect").every(r => r.args[3] >= 1));
});
```

- [ ] **Step 2: 실패를 확인한다**

```bash
cd map/mobile && node --test test/chart.test.mjs
```
Expected: FAIL — `Cannot find module '../www/chart.js'`

- [ ] **Step 3: 최소 구현**

`map/mobile/www/chart.js`:

```js
// Phase 0 차트 — 엔진 출력이 그림이 되는지 확인하는 최소 렌더러.
// 축·크로스헤어·핀치줌·로그축은 Phase 1 몫이며 여기 없다.
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.MSChart = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function chartGeometry(o) {
    var candle = o.candle || [];
    var pred = o.prediction || null;
    var W = o.width, H = o.height, pad = (o.pad == null ? 8 : o.pad);
    var tail = Math.min(o.tailBars || 120, candle.length);
    var src = candle.slice(candle.length - tail);
    var fut = (pred && pred.path) ? pred.path.length : 0;

    var min = Infinity, max = -Infinity;
    src.forEach(function (b) { if (b.l < min) min = b.l; if (b.h > max) max = b.h; });
    if (pred) {
      (pred.lo || []).forEach(function (v) { if (v < min) min = v; });
      (pred.hi || []).forEach(function (v) { if (v > max) max = v; });
    }
    if (!isFinite(min) || !isFinite(max)) { min = 0; max = 1; }
    if (max - min < 1e-9) { min -= 0.5; max += 0.5; }   // 평탄 시리즈 0 나눗셈 방지

    var span = max - min;
    var plotW = W - pad * 2, plotH = H - pad * 2;
    var slots = Math.max(1, tail + fut);
    var dx = plotW / slots;
    function xAt(i) { return pad + dx * (i + 0.5); }
    function yAt(p) { return pad + plotH * (1 - (p - min) / span); }

    var bars = src.map(function (b, i) {
      return { x: xAt(i), yO: yAt(b.o), yH: yAt(b.h), yL: yAt(b.l), yC: yAt(b.c), up: b.c >= b.o };
    });
    var cone = { hi: [], lo: [] }, path = [];
    if (pred) {
      for (var k = 0; k < fut; k++) {
        var x = xAt(tail + k);
        path.push({ x: x, y: yAt(pred.path[k]) });
        if (pred.hi && pred.hi[k] != null) cone.hi.push({ x: x, y: yAt(pred.hi[k]) });
        if (pred.lo && pred.lo[k] != null) cone.lo.push({ x: x, y: yAt(pred.lo[k]) });
      }
    }
    return { bars: bars, cone: cone, path: path, bw: Math.max(1, dx * 0.62),
             min: min, max: max, tail: tail, fut: fut, dx: dx };
  }

  function drawChart(ctx, geo, col) {
    ctx.save();

    if (geo.cone.hi.length && geo.cone.lo.length) {
      ctx.beginPath();
      geo.cone.hi.forEach(function (p, i) { i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); });
      for (var i = geo.cone.lo.length - 1; i >= 0; i--) ctx.lineTo(geo.cone.lo[i].x, geo.cone.lo[i].y);
      ctx.closePath();
      ctx.fillStyle = col.cone;
      ctx.fill();
    }

    geo.bars.forEach(function (b) {
      var c = b.up ? col.bull : col.bear;
      ctx.strokeStyle = c;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(b.x, b.yH); ctx.lineTo(b.x, b.yL); ctx.stroke();
      ctx.fillStyle = c;
      // 도지(시가=종가)도 보이도록 최소 1px
      ctx.fillRect(b.x - geo.bw / 2, Math.min(b.yO, b.yC), geo.bw, Math.max(1, Math.abs(b.yC - b.yO)));
    });

    if (geo.path.length) {
      ctx.beginPath();
      geo.path.forEach(function (p, i) { i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); });
      ctx.strokeStyle = col.gold;
      ctx.lineWidth = 1.25;
      ctx.stroke();
    }

    ctx.restore();
  }

  return { chartGeometry: chartGeometry, drawChart: drawChart };
});
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
cd map/mobile && node --test test/chart.test.mjs
```
Expected: PASS (10건)

- [ ] **Step 5: 커밋**

```bash
cd /home/jschoi0223/projects/vdiportal
git add map/mobile/www/chart.js map/mobile/test/chart.test.mjs
git commit -m "mobile(phase0): 차트 기하 + 페인트 (캔들·예측 콘·경로)

페인트 단언은 recording-ctx 심으로 — 반환값만 보면 색이 실제로 칠해졌는지
알 수 없다(forge-tools 스와치 사고의 교훈). chart.test.mjs 10건.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: 측정 함수 + 스파이크 화면

**Files:**
- Create: `map/mobile/www/bench.js`
- Create: `map/mobile/test/bench.test.mjs`
- Create: `map/mobile/www/index.html`
- Create: `map/mobile/www/style.css`
- Create: `map/mobile/www/spike.js`

**Interfaces:**
- Consumes: `MSApi` · `MSGraph` · `MSChart` · 전역 `ForgeCore`
- Produces: 전역 `MSBench` = `{ measure(fn, n?, clock?) -> {median, min, max, n, samples} }`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`map/mobile/test/bench.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const MSBench = require("../www/bench.js");

// 가짜 시계 — 실제 시간에 의존하지 않는 테스트.
// measure 는 반복마다 clock() 을 두 번 부른다(시작·종료). 짝수번째 호출은 시작 시각을
// 그대로 주고, 홀수번째 호출에서 소요분을 더한 뒤 준다 = 그 반복의 경과시간이 deltas[k].
function clockFrom(deltas) {
  let t = 0, i = 0;
  return () => {
    if (i % 2 === 1) t += deltas[(i - 1) >> 1];
    i++;
    return t;
  };
}

test("워밍업 1회는 표본에서 빠진다", () => {
  let calls = 0;
  MSBench.measure(() => { calls++; }, 5, clockFrom([1, 1, 1, 1, 1]));
  assert.equal(calls, 6, "워밍업 포함 6회여야 한다");
});

test("중앙값·최소·최대를 정렬해서 낸다", () => {
  const r = MSBench.measure(() => {}, 5, clockFrom([50, 10, 30, 20, 40]));
  assert.equal(r.min, 10);
  assert.equal(r.max, 50);
  assert.equal(r.median, 30);
  assert.equal(r.n, 5);
  assert.deepEqual(r.samples, [10, 20, 30, 40, 50]);
});

test("n 을 생략하면 5회", () => {
  const r = MSBench.measure(() => {}, undefined, clockFrom([1, 2, 3, 4, 5]));
  assert.equal(r.n, 5);
  assert.equal(r.samples.length, 5);
});

test("짝수 표본에서도 중앙값이 표본 안의 값이다", () => {
  const r = MSBench.measure(() => {}, 4, clockFrom([10, 20, 30, 40]));
  assert.ok(r.samples.includes(r.median));
});
```

- [ ] **Step 2: 실패를 확인한다**

```bash
cd map/mobile && node --test test/bench.test.mjs
```
Expected: FAIL — `Cannot find module '../www/bench.js'`

- [ ] **Step 3: bench.js 구현**

`map/mobile/www/bench.js`:

```js
// 실행시간 측정. 워밍업 1회로 JIT 을 데운 뒤 n회 표본을 뜬다 —
// 첫 호출은 컴파일 비용이 섞여 기기 성능을 과소평가하게 만든다.
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.MSBench = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function defaultClock() {
    return (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
  }

  function measure(fn, n, clock) {
    n = n || 5;
    clock = clock || defaultClock;
    fn();                                   // 워밍업 — 표본에 넣지 않는다
    var t = [];
    for (var i = 0; i < n; i++) {
      var a = clock();
      fn();
      t.push(clock() - a);
    }
    t.sort(function (x, y) { return x - y; });
    return { median: t[Math.floor((t.length - 1) / 2)], min: t[0], max: t[t.length - 1], n: n, samples: t };
  }

  return { measure: measure };
});
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
cd map/mobile && node --test test/bench.test.mjs
```
Expected: PASS (4건)

- [ ] **Step 5: 스파이크 화면 3파일을 쓴다**

`map/mobile/www/index.html` — 로드 순서 고정(core → api → graph → chart → bench → spike), `defer` 없음:

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>MoneyScoop — Phase 0 Spike</title>
<link rel="stylesheet" href="style.css">
</head>
<body>
<h1>Phase 0 Spike</h1>
<p class="sub">엔진이 WebView 에서 도는지 · 얼마나 걸리는지</p>

<div class="row">
  <input id="sym" value="AAPL" autocapitalize="characters" autocorrect="off" spellcheck="false">
  <button id="go">분석</button>
</div>

<p id="status" class="status">대기</p>

<canvas id="chart" width="372" height="240"></canvas>

<div id="verdict" class="card"></div>
<div id="timing" class="card"></div>
<div id="env" class="card"></div>

<script src="vendor/forge-core.js"></script>
<script src="api.js"></script>
<script src="graph.js"></script>
<script src="chart.js"></script>
<script src="bench.js"></script>
<script src="spike.js"></script>
</body>
</html>
```

`map/mobile/www/style.css`:

```css
:root {
  --bg: #0a0d12; --ink: #eef1f7; --ink-3: #9aa3b6; --ink-4: #7c8598; --ink-5: #78819a;
  --gold: #e8b463; --bull: #4fb98a; --bear: #d96a6a;
  --border: rgba(238,241,247,.10); --hairline: rgba(238,241,247,.06);
}
* { box-sizing: border-box; }
body {
  margin: 0; padding: 20px; background: var(--bg); color: var(--ink);
  font-family: system-ui, -apple-system, sans-serif;
  font-variant-numeric: tabular-nums;
  padding-bottom: calc(20px + env(safe-area-inset-bottom));
}
h1 { font-size: 20px; font-weight: 600; letter-spacing: -.03em; margin: 0 0 4px; }
.sub { font-size: 12.5px; color: var(--ink-4); margin: 0 0 20px; }
.row { display: flex; gap: 8px; margin-bottom: 12px; }
input {
  flex: 1; min-height: 44px; padding: 0 12px; border-radius: 9px;
  border: 1px solid var(--border); background: transparent; color: var(--ink);
  font: inherit; font-variant-numeric: tabular-nums;
}
button {
  min-height: 44px; min-width: 88px; padding: 0 18px; border: 0; border-radius: 9px;
  background: var(--gold); color: #1a1408; font: inherit; font-weight: 600;
}
button:disabled { opacity: .45; }
.status { font-size: 12.5px; color: var(--ink-3); margin: 0 0 12px; min-height: 18px; }
canvas { width: 100%; height: auto; display: block; border-radius: 9px; background: #0b0e15; }
.card {
  margin-top: 12px; padding: 12px 14px; border: 1px solid var(--border); border-radius: 9px;
  font-size: 12.5px; line-height: 1.7; color: var(--ink-3); white-space: pre-wrap;
}
.card b { color: var(--ink); font-weight: 600; }
.up { color: var(--bull); } .down { color: var(--bear); }
```

`map/mobile/www/spike.js`:

```js
// 스파이크 배선 — 순수 로직은 api/graph/chart/bench 에 있고 여기엔 없다(그래서 테스트도 없다).
(function () {
  "use strict";

  var TFS = ["1day", "1week", "1month"];
  var COL = { bull: "#4fb98a", bear: "#d96a6a", gold: "#e8b463", cone: "rgba(232,180,99,.09)" };
  var FUTW = 60;

  var $ = function (id) { return document.getElementById(id); };
  function say(msg) { $("status").textContent = msg; }
  function ms(v) { return v.toFixed(1) + "ms"; }

  function fitCanvas(cv) {
    var dpr = window.devicePixelRatio || 1;
    var cssW = cv.clientWidth || 372, cssH = 240;
    cv.width = Math.round(cssW * dpr);
    cv.height = Math.round(cssH * dpr);
    cv.style.height = cssH + "px";
    var ctx = cv.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx: ctx, w: cssW, h: cssH };
  }

  function showEnv() {
    $("env").innerHTML =
      "<b>환경</b>\n" +
      "엔진 " + ForgeCore.version + " · 지표 " + ForgeCore.indicatorCount + "종\n" +
      "화면 " + window.innerWidth + "×" + window.innerHeight + " · DPR " + (window.devicePixelRatio || 1) + "\n" +
      "UA " + navigator.userAgent;
  }

  async function runSpike() {
    var sym = $("sym").value.trim().toUpperCase();
    if (!sym) { say("종목을 입력하세요"); return; }
    $("go").disabled = true;
    $("verdict").textContent = ""; $("timing").textContent = "";

    var graph = MSGraph.full32Graph(ForgeCore);
    var indN = MSGraph.indicatorTypes(graph).length;
    var data = {}, netMs = {}, runStat = {}, total = 0;

    try {
      for (var i = 0; i < TFS.length; i++) {
        var tf = TFS[i];
        say(sym + " " + tf + " 불러오는 중… (" + (i + 1) + "/3)");
        var t0 = performance.now();
        var res = await fetch(MSApi.ohlcUrl(sym, tf));
        var json = await res.json();
        netMs[tf] = performance.now() - t0;
        data[tf] = MSApi.normalizeCandles(json);
      }
    } catch (e) {
      say("실패: " + e.message);
      $("go").disabled = false;
      return;
    }

    say("분석 중… (" + indN + "지표 × " + TFS.length + "주기)");
    await new Promise(function (r) { requestAnimationFrame(function () { setTimeout(r, 16); }); });

    var last = null;
    TFS.forEach(function (tf) {
      var d = { price: data[tf].price, candle: data[tf].candle };
      var out = null;
      var stat = MSBench.measure(function () {
        out = ForgeCore.run(graph, d, { futW: FUTW, timeframe: tf });
      }, 5);
      runStat[tf] = stat;
      total += stat.median;
      if (tf === "1day") last = out;
    });

    var v = last.verdict;
    var dir = v.score >= 0 ? "up" : "down";
    $("verdict").innerHTML =
      "<b>" + sym + "</b> · " + data["1day"].name + " · " + data["1day"].source + "\n" +
      "as of " + data["1day"].asOf + " · 봉 " + data["1day"].candle.length + "\n" +
      "국면 <b>" + v.regime + "</b> · 점수 <b class='" + dir + "'>" + v.score + "</b>\n" +
      "목표 " + v.target.toFixed(2) + " · 무효화 " + v.invalidation.toFixed(2) + "\n" +
      "합류 " + v.confluence.score + " (" + v.confluence.agree + "/" + v.confluence.total + ")";

    var lines = ["<b>실행시간</b> — " + indN + "지표, 표본 5회 중앙값"];
    TFS.forEach(function (tf) {
      var s = runStat[tf];
      lines.push(tf + "  분석 " + ms(s.median) + " (" + ms(s.min) + "~" + ms(s.max) + ")  네트워크 " + ms(netMs[tf]));
    });
    lines.push("<b>3주기 합계 " + ms(total) + "</b>  · 판정 임계 2000ms");
    lines.push(total > 2000 ? "→ Web Worker 필요" : "→ Worker 없이 가능");
    $("timing").innerHTML = lines.join("\n");

    var cv = fitCanvas($("chart"));
    var geo = MSChart.chartGeometry({
      candle: data["1day"].candle, prediction: last.prediction,
      width: cv.w, height: cv.h, pad: 10, tailBars: 120
    });
    cv.ctx.clearRect(0, 0, cv.w, cv.h);
    MSChart.drawChart(cv.ctx, geo, COL);

    say("완료");
    $("go").disabled = false;
  }

  $("go").addEventListener("click", runSpike);
  showEnv();
})();
```

- [ ] **Step 6: 데스크톱 브라우저에서 동작 확인**

```bash
cd map/mobile && npm run sync && python3 -m http.server 8123 --directory www
```
브라우저에서 `http://localhost:8123` → `분석` 클릭.

Expected:
- `실행시간` 카드에 3주기 각각의 값과 합계가 뜬다 (데스크톱 기준선: 합계 약 200ms)
- `판정` 줄이 `→ Worker 없이 가능`
- 캔버스에 캔들 120개 + 골드 예측 경로 + 옅은 골드 콘
- `환경` 카드에 엔진 `1.11.0` · 지표 `32`

- [ ] **Step 7: 전체 테스트 통과 확인**

```bash
cd map/mobile && npm test
```
Expected: PASS (sync 3 + api 8 + graph 6 + chart 10 + bench 4 = 31건)

- [ ] **Step 8: 커밋**

```bash
cd /home/jschoi0223/projects/vdiportal
git add map/mobile/www/bench.js map/mobile/test/bench.test.mjs map/mobile/www/index.html map/mobile/www/style.css map/mobile/www/spike.js
git commit -m "mobile(phase0): 측정 함수 + 스파이크 화면

워밍업 1회를 표본에서 빼는 measure(). 스파이크는 3주기 fetch → 32지표 분석
5회 표본 → 캔들·콘 작도 → 2초 임계 판정을 한 화면에 낸다. bench.test.mjs 4건.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Capacitor 안드로이드 + 폴드7 설치

여기서부터는 자동 테스트가 아니라 **기기 검증**이다. 각 단계의 실제 출력을 Task 7의 기록 문서에 남긴다.

**Files:**
- Create: `map/mobile/capacitor.config.json`
- Create: `map/mobile/android/` (`cap add android` 생성물)
- Modify: `map/mobile/package.json` (의존성 추가 — `npm i`가 자동 수정)

**Interfaces:**
- Consumes: Task 5의 `www/`
- Produces: 폴드7에 설치된 디버그 APK

- [ ] **Step 1: Capacitor 설치와 초기화**

```bash
cd map/mobile
npm i @capacitor/core @capacitor/cli @capacitor/android
```

- [ ] **Step 2: 설정 파일을 쓴다**

`map/mobile/capacitor.config.json`:

```json
{
  "appId": "com.moneyscoop.mobile",
  "appName": "MoneyScoop",
  "webDir": "www",
  "server": {
    "androidScheme": "https"
  },
  "android": {
    "allowMixedContent": false
  }
}
```

`androidScheme: "https"`인 이유: 커스텀 스킴(`capacitor://`)을 insecure origin 으로 취급하는 API·쿠키 동작이 있어 나중에 인증을 붙일 때 물린다.

- [ ] **Step 3: 안드로이드 플랫폼을 붙인다**

```bash
cd map/mobile && npm run sync && npx cap add android && npx cap sync android
```
Expected: `android/` 생성 · `✔ Copying web assets` · `✔ Sync finished`

- [ ] **Step 4: 폴드 접힘↔펼침에 WebView 가 리로드되지 않게 한다**

`map/mobile/android/app/src/main/AndroidManifest.xml`의 `<activity>` 태그에서 `android:configChanges` 값을 확인하고, `screenLayout|smallestScreenSize|screenSize|orientation|keyboardHidden` 가 모두 포함되도록 수정한다. Capacitor 기본값에 `screenLayout`·`smallestScreenSize`가 빠져 있으면 폴드를 펼칠 때 액티비티가 재생성되어 분석 결과가 날아간다.

확인:

```bash
grep -n "configChanges" map/mobile/android/app/src/main/AndroidManifest.xml
```
Expected: `screenLayout` 와 `smallestScreenSize` 가 값에 포함돼 있다

- [ ] **Step 5: 폰을 개발자 모드로 두고 연결한다**

폴드7에서: 설정 → 휴대전화 정보 → 소프트웨어 정보 → **빌드번호 7회 탭** → 설정 → 개발자 옵션 → **USB 디버깅 켜기** → USB 연결 → 폰에 뜨는 `USB 디버깅을 허용하시겠습니까?`에서 허용.

Windows PowerShell 또는 WSL 에서 확인:

```bash
/mnt/c/Users/yotac/AppData/Local/Android/Sdk/platform-tools/adb.exe devices
```
Expected: 기기 시리얼 + `device` (`unauthorized`면 폰의 허용 팝업을 다시 확인)

- [ ] **Step 6: Android Studio 로 빌드해 설치한다**

**빌드는 Windows 에서 한다** — WSL 에 sudo 가 없어 JDK 를 설치할 수 없고, Windows 에는 Android Studio 의 JBR 과 SDK 가 이미 있다.

Android Studio → `Open` → 경로에 다음을 붙여넣기:

```
\\wsl$\Ubuntu\home\jschoi0223\projects\vdiportal\map\mobile\android
```

Gradle sync 를 기다린 뒤(첫 회는 의존성 내려받느라 오래 걸린다) 상단 기기 선택에서 폴드7 을 고르고 ▶ Run.

**폴백** — `\\wsl$` 경로에서 Gradle sync 가 5분을 넘거나 실패하면, Phase 0 은 측정이 목적이므로 사본으로 빌드해도 된다:

```bash
cp -r /home/jschoi0223/projects/vdiportal/map/mobile /mnt/c/dev/ms-mobile-build
```
`C:\dev\ms-mobile-build\android` 를 대신 열어 빌드한다. 이 사본은 측정 후 버린다. 정식 빌드 경로는 Phase 0 종료 시점에 결정한다(Task 7 기록 항목).

- [ ] **Step 7: 앱이 실제로 도는지 확인한다**

폰에서 MoneyScoop 앱을 열고 `분석`을 누른다.

Expected:
- `환경` 카드에 폴드7 UA · 화면 크기 · DPR
- 3주기 fetch 성공 (CORS 오류가 나면 안 된다 — 서버는 이미 열려 있다)
- `실행시간` 카드에 합계와 판정
- 캔버스에 캔들 + 콘

실패하면 `chrome://inspect/#devices` (Windows Chrome) 에서 WebView 를 열어 콘솔을 본다.

- [ ] **Step 8: 커밋**

```bash
cd /home/jschoi0223/projects/vdiportal
git add map/mobile/capacitor.config.json map/mobile/package.json map/mobile/package-lock.json map/mobile/android
git commit -m "mobile(phase0): Capacitor 안드로이드 플랫폼

androidScheme=https (커스텀 스킴을 insecure 로 보는 API·쿠키 동작 회피).
폴드 접힘/펼침에 WebView 가 재생성되지 않도록 configChanges 보강.
빌드는 Windows Android Studio — WSL 에 sudo 가 없어 JDK 설치 불가.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: 3조건 측정 · 판정 기록

Phase 0 의 산출물은 APK 가 아니라 **판정**이다. 측정치가 기록되지 않으면 Phase 1 에서 다시 잰다.

**Files:**
- Create: `map/mobile/docs/phase0-measurements.md`
- Modify: `map/mobile/docs/BACKLOG-mobile.md`

**Interfaces:**
- Consumes: Task 6의 설치된 앱
- Produces: Worker 도입 여부 판정 · Phase 1 로 넘길 확인 항목

- [ ] **Step 1: 조건 A — 데스크톱 기준선**

```bash
cd map/mobile && python3 -m http.server 8123 --directory www
```
Chrome 에서 `http://localhost:8123` → 스로틀 없음 → `분석`. `실행시간` 카드 전체를 기록.

- [ ] **Step 2: 조건 B — 데스크톱 6배 스로틀(중급기 대리치)**

같은 페이지에서 DevTools → Performance 탭 → 톱니바퀴 → **CPU: 6× slowdown** → `분석`. 기록.

- [ ] **Step 3: 조건 C — 폴드7 커버 화면**

폰을 접은 상태로 앱 실행 → `분석`. `환경`·`실행시간` 카드 기록.

- [ ] **Step 4: 조건 D — 폴드7 펼친 화면**

**분석 결과가 화면에 떠 있는 상태에서 폰을 펼친다.** 두 가지를 본다: ① 결과가 그대로 남아 있는가(configChanges 가 먹었는가) ② 다시 분석했을 때 시간이 달라지는가. 기록.

- [ ] **Step 5: `forge-tools.js` 터치 바인딩 여부를 확인한다**

```bash
cd map && grep -n "addEventListener(\"\(mouse\|pointer\|touch\)" forge-tools.js | head -20
grep -c "pointerdown\|pointermove\|pointerup" forge-tools.js
grep -c "mousedown\|mousemove\|mouseup" forge-tools.js
```
포인터 이벤트를 쓰면 터치가 그대로 들어오고, 마우스 이벤트뿐이면 Phase 1 에서 재바인딩이 필요하다. 결과를 기록.

- [ ] **Step 6: 기록 문서를 쓴다**

`map/mobile/docs/phase0-measurements.md` — 아래 틀에 **실제 측정치**를 채운다. 빈칸이나 "측정 예정"을 남기지 말 것:

```markdown
# Phase 0 실측 — 엔진 · WebView · 기기

- 측정일: <YYYY-MM-DD>
- 엔진: forge-core <버전> · 지표 <N>종 · 그래프 노드 <N>개
- 종목: AAPL · 주기 1day/1week/1month · futW 60 · 표본 5회 중앙값

## 실행시간

| 조건 | 1day | 1week | 1month | 합계 | 판정(임계 2000ms) |
|---|---|---|---|---|---|
| A 데스크톱 (스로틀 없음) | | | | | |
| B 데스크톱 6× 스로틀 (중급기 대리) | | | | | |
| C 폴드7 커버 화면 | | | | | |
| D 폴드7 펼친 화면 | | | | | |

사전 노드 기준선(참고): 32지표 1TF 86.5ms · 3TF 202.8ms · 6× 환산 1.22s

## 네트워크

| 조건 | 1day | 1week | 1month |
|---|---|---|---|
| 데스크톱 | | | |
| 폴드7 | | | |

## 판정

- **Web Worker 도입**: 필요 / 불필요 — 근거:
- **지표별 진행률 UI**: 필요 / 불필요 — 근거:

## 기기 환경

- UA:
- 커버 화면 / 펼친 화면 크기 · DPR:
- 펼칠 때 결과 유지 여부(configChanges):

## 부수 확인

- `forge-tools.js` 이벤트: pointer <N>건 / mouse <N>건 → 터치 재바인딩 필요 여부:
- 빌드 경로: `\\wsl$` 직접 / Windows 사본 폴백 — Gradle sync 소요:

## Phase 1 로 넘기는 것

-
```

- [ ] **Step 7: 백로그를 갱신한다**

`map/mobile/docs/BACKLOG-mobile.md`의 `🔥 진행 중` 항목을 완료로 옮기고, 판정 결과와 Phase 1 로 넘긴 항목을 한 줄씩 적는다. cafe24 PHP 의 SQLite(PDO) 확장 확인은 **v2 지갑 계획 시점**의 항목으로 `📋 예정`에 넣는다 — Phase 0 을 끝내는 데 필요하지 않고, 확인하려면 서버에 임시 프로브 파일을 올렸다 지워야 해서 별도 승인이 필요하다.

- [ ] **Step 8: 커밋**

```bash
cd /home/jschoi0223/projects/vdiportal
git add map/mobile/docs/phase0-measurements.md map/mobile/docs/BACKLOG-mobile.md
git commit -m "mobile(phase0): 3조건 실측 + Worker 판정 기록

Phase 0 의 산출물은 APK 가 아니라 판정이다 — 기록하지 않으면 Phase 1 에서
다시 잰다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## 완료 기준

Phase 0 은 아래가 전부 참일 때 끝난다.

1. 폴드7 에 설치된 앱에서 `분석`을 누르면 실 OHLC 를 받아 32지표 × 3주기를 돌리고 캔들·예측 콘이 그려진다
2. `npm test` 31건 통과 · `node --test forge-core.test.js` 251건 통과(엔진 무회귀)
3. `map/mobile/www/vendor/`가 커밋되지 않았다
4. `docs/phase0-measurements.md`에 4조건 실측치와 **Worker 도입 판정**이 빈칸 없이 적혀 있다
5. 폰을 펼쳐도 분석 결과가 살아 있다

## 하지 않는 것

축·크로스헤어·핀치줌·로그축 · 워치리스트 · 티어 · 지갑 · 광고 · 계정 · Pretendard 번들 · 다국어 · 아이콘·스플래시 · 서명 빌드 · Play 업로드. 전부 Phase 1 이후다.
