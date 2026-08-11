import { test } from "node:test";
import assert from "node:assert";
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { syncEngine, syncBacktest, ENGINE_FILES } from "../sync-engine.mjs";

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

test("백테스트 요약이 원본 리포트의 값을 그대로 담는다", () => {
  const src = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const dst = tmp("ms-bt-");
  const s = syncBacktest(src, dst);
  const raw = JSON.parse(readFileSync(join(src, "forge-backtest-report.json"), "utf8"));
  assert.strictEqual(s.directionHitRate, raw.overall.directionHitRate);
  assert.strictEqual(s.calibrationECE, raw.overall.calibrationECE);
  assert.strictEqual(s.coneCoverage, raw.overall.coneCoverage);
  assert.strictEqual(s.avgWin, raw.overall.pnl.avgWin);
  assert.strictEqual(s.avgLoss, raw.overall.pnl.avgLoss);
  assert.strictEqual(s.nSeries, raw.universe.length);
  assert.strictEqual(s.generatedAt, raw.generatedAt);
});

test("백테스트 요약의 실측값 — 2026-07 리포트", () => {
  // 리터럴이다. raw 에서 읽어 비교하면 위 테스트와 같은 항등식이 되어 값이 바뀌어도 안 잡힌다.
  const src = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const s = syncBacktest(src, tmp("ms-bt2-"));
  assert.strictEqual(Math.round(s.directionHitRate * 1000) / 1000, 0.581);
  assert.strictEqual(Math.round(s.coneCoverage * 1000) / 1000, 0.777);
  assert.strictEqual(s.nForecasts, 31496);
  assert.strictEqual(s.nSeries, 86);
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
