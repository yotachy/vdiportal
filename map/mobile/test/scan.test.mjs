import { test } from "node:test";
import assert from "node:assert";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const MSScan = require("../www/scan.js");

function harness(behavior) {
  const slept = [];
  const calls = [];
  const scanner = MSScan.createScanner({
    loadOne: async sym => { calls.push(sym); const b = behavior[sym]; if (typeof b === "function") return b(); return { sym }; },
    analyze: (sym, data) => ({ sym, price: 1 }),
    sleep: async ms => { slept.push(ms); },
    gap: 100, maxRetry: 2
  });
  return { scanner, slept, calls };
}

test("종목을 입력 순서대로 처리한다", async () => {
  const h = harness({});
  const seen = [];
  await h.scanner.run(["AAPL", "NVDA", "MSFT"], s => seen.push(s));
  assert.deepEqual(h.calls, ["AAPL", "NVDA", "MSFT"]);
  assert.deepEqual(seen, ["AAPL", "NVDA", "MSFT"]);
});

test("각 종목 결과를 즉시 콜백한다 — 전체 완료를 기다리지 않는다", async () => {
  const h = harness({});
  const at = [];
  await h.scanner.run(["AAPL", "NVDA"], (sym, rec) => at.push([sym, rec && rec.price]));
  assert.deepEqual(at, [["AAPL", 1], ["NVDA", 1]]);
});

test("실패는 지수 백오프로 재시도하고, 소진되면 err 로 콜백한 뒤 계속 간다", async () => {
  let n = 0;
  const h = harness({ AAPL: () => { n++; throw new Error("429"); } });
  const out = [];
  const r = await h.scanner.run(["AAPL", "NVDA"], (sym, rec, err) => out.push([sym, !!err]));
  assert.equal(n, 3, "1회 + 재시도 2회여야 한다");
  assert.deepEqual(h.slept.filter(x => x >= 100), [100, 200, 100], "백오프 100·200 후 다음 종목 간격 100");
  assert.deepEqual(out, [["AAPL", true], ["NVDA", false]]);
  assert.deepEqual(r, { done: 1, failed: 1 });
});

test("한 번 실패 후 성공하면 재시도 결과를 쓴다", async () => {
  let n = 0;
  const h = harness({ AAPL: () => { n++; if (n === 1) throw new Error("429"); return { sym: "AAPL" }; } });
  const out = [];
  await h.scanner.run(["AAPL"], (sym, rec, err) => out.push([sym, !!rec, !!err]));
  assert.deepEqual(out, [["AAPL", true, false]]);
});

test("빈 목록은 즉시 끝난다", async () => {
  const h = harness({});
  assert.deepEqual(await h.scanner.run([], () => {}), { done: 0, failed: 0 });
  assert.equal(h.slept.length, 0);
});
