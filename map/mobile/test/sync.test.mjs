import { test } from "node:test";
import assert from "node:assert";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { syncEngine, syncBacktest, engineVersion, ENGINE_FILES } from "../sync-engine.mjs";

function tmp(p) { return mkdtempSync(join(tmpdir(), p)); }

// 버전 검사만 격리해 보기 위한 최소 원본 한 벌. forge-core 는 UMD 라 CJS 로 잡히므로 흉내도 CJS.
function fakeSrc(engineVer, reportVer) {
  const d = tmp("ms-ver-");
  writeFileSync(join(d, "forge-core.js"), "module.exports = { version: " + JSON.stringify(engineVer) + " };\n");
  const rep = { generatedAt: "2026-01", universe: [{ points: 7 }], overall: { pnl: {} } };
  if (reportVer !== undefined) rep.engineVersion = reportVer;
  writeFileSync(join(d, "forge-backtest-report.json"), JSON.stringify(rep));
  return d;   // backtest/ 가 없으므로 종목 지문 검사는 건너뛴다 — 버전 검사만 격리해 본다
}

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

test("백테스트 요약이 원본 리포트의 값을 그대로 담는다", () => {
  const src = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const dst = tmp("ms-bt-");
  const s = syncBacktest(src, dst);
  const raw = JSON.parse(readFileSync(join(src, "forge-backtest-report.json"), "utf8"));
  assert.strictEqual(s.directionHitRate, raw.overall.directionHitRate);
  assert.strictEqual(s.bullHitRate, raw.overall.bullHitRate);
  assert.strictEqual(s.bearHitRate, raw.overall.bearHitRate);
  assert.strictEqual(s.calibrationECE, raw.overall.calibrationECE);
  assert.strictEqual(s.coneCoverage, raw.overall.coneCoverage);
  assert.strictEqual(s.avgWin, raw.overall.pnl.avgWin);
  assert.strictEqual(s.avgLoss, raw.overall.pnl.avgLoss);
  assert.strictEqual(s.nSeries, raw.universe.length);
  assert.strictEqual(s.generatedAt, raw.generatedAt);
});

test("백테스트 요약의 실측값 — 2026-08 리포트(엔진 1.11.0 · 87종)", () => {
  // 리터럴이다. raw 에서 읽어 비교하면 위 테스트와 같은 항등식이 되어 값이 바뀌어도 안 잡힌다.
  // 이 값들이 바뀌면 화면에 나가는 숫자가 바뀐 것이다 — 갱신 전에 왜 바뀌었는지 먼저 답할 것.
  // (2026-08 갱신: 86종 31,496건 → 87종 31,971건. 종목이 하나 늘었는데 재측정을 안 했던
  //  것이 이 갱신으로 드러났다. 그래서 종목 집합 지문 검사가 생겼다.)
  const src = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const s = syncBacktest(src, tmp("ms-bt2-"));
  assert.strictEqual(Math.round(s.directionHitRate * 1000) / 1000, 0.582);
  assert.strictEqual(Math.round(s.bullHitRate * 1000) / 1000, 0.617);
  assert.strictEqual(Math.round(s.bearHitRate * 1000) / 1000, 0.425);
  assert.strictEqual(Math.round(s.coneCoverage * 1000) / 1000, 0.778);
  assert.strictEqual(s.nForecasts, 31971);
  assert.strictEqual(s.nSeries, 87);
});

test("종목이 늘었는데 재측정을 안 하면 빌드를 세운다", () => {
  // 엔진 버전만 보면 이 경우를 놓친다 — 실제로 7월 리포트가 86종으로 잰 값을 87종이 된
  // 뒤에도 그대로 내보내고 있었다. 엔진은 그대로였으니 버전 검사로는 잡히지 않는다.
  const real = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const raw = JSON.parse(readFileSync(join(real, "forge-backtest-report.json"), "utf8"));
  assert.ok(raw.fixtures, "리포트에 종목 집합 지문이 없다");
  const d = tmp("ms-fx-");
  writeFileSync(join(d, "forge-core.js"), "module.exports = { version: \"9.9.9\" };\n");
  mkdirSync(join(d, "backtest", "fixtures"), { recursive: true });
  // 엔진 버전은 일치시키고 종목만 어긋나게 한다 — 잡히는 이유가 종목임을 분리해 본다.
  writeFileSync(join(d, "backtest", "backtest.js"),
    "module.exports = { fixturesFingerprint: () => \"99:deadbeefcafe\" };\n");
  writeFileSync(join(d, "forge-backtest-report.json"),
    JSON.stringify({ engineVersion: "9.9.9", fixtures: "87:ce6407fe69c9", universe: [], overall: { pnl: {} } }));
  assert.throws(() => syncBacktest(d, tmp("ms-fx-dst-")),
    /현 종목 집합의 측정치가 아니다: 리포트 87:ce6407fe69c9 ≠ 현재 99:deadbeefcafe/);
});

test("생성 파일은 window.MSBacktest 를 심는 JS 다 — fetch 없이 script 로 읽는다", () => {
  const src = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const dst = tmp("ms-bt3-");
  syncBacktest(src, dst);
  const js = readFileSync(join(dst, "backtest-summary.js"), "utf8");
  assert.match(js, /window\.MSBacktest\s*=/);
  assert.doesNotMatch(js, /fetch|XMLHttpRequest/);
});

test("리포트가 없으면 조용히 넘어가지 않고 던진다", () => {
  assert.throws(() => syncBacktest(tmp("ms-nosrc-"), tmp("ms-nodst-")), /백테스트 리포트 없음/);
});

test("엔진이 올라갔는데 재측정을 안 했으면 빌드를 세운다", () => {
  // 이게 없으면 7월에 잰 적중률이 8월 엔진의 실측치인 척 화면에 계속 나간다.
  assert.throws(() => syncBacktest(fakeSrc("2.0.0", "1.11.0"), tmp("ms-dst-")),
    /백테스트가 현 엔진의 측정치가 아니다: 리포트 1\.11\.0 ≠ 엔진 2\.0\.0/);
});

test("스탬프가 아예 없는 옛 리포트도 통과시키지 않는다", () => {
  // 소급해 찍으면 거짓말이 되므로, 스탬프 없음은 '모름'이지 '맞음'이 아니다.
  assert.throws(() => syncBacktest(fakeSrc("1.11.0", undefined), tmp("ms-dst-")), /스탬프 없음/);
});

test("버전이 맞으면 통과하고 요약이 그 버전을 달고 나온다", () => {
  const s = syncBacktest(fakeSrc("1.11.0", "1.11.0"), tmp("ms-dst-"));
  assert.strictEqual(s.engineVersion, "1.11.0");
});

test("엔진 원본이 없으면 버전을 지어내지 않는다", () => {
  assert.throws(() => engineVersion(tmp("ms-noeng-")), /엔진 원본 없음/);
});

test("요약이 '몇 종을 읽고 잰 값인지'를 싣는다 — 적중률 고지의 근거", () => {
  // 측정 그래프는 19종이고 엔진 배터리는 32종이다. 둘을 구분해 싣지 않으면 화면이
  // '32개로 잰 값'이라고 잘못 귀속하게 된다.
  const src = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const s = syncBacktest(src, tmp("ms-scope-"));
  assert.strictEqual(s.graphIndicators, 19);
  assert.strictEqual(s.indicatorCount, 32);
  assert.ok(s.graphIndicators < s.indicatorCount, "측정 그래프가 전체 배터리보다 작다는 사실 자체가 고지 대상");
});
