import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const S = require("../www/onboarding-sample.js");

test("번들 시계는 240봉이고 작도에 필요한 것을 다 갖췄다", () => {
  assert.strictEqual(S.candle.length, 240);
  assert.strictEqual(S.price.length, 240);
  assert.match(S.asOf, /^\d{4}-\d{2}-\d{2}$/);
  S.candle.forEach((c, i) => {
    ["o", "h", "l", "c", "v"].forEach(k => assert.ok(isFinite(c[k]), "봉 " + i + " 의 " + k));
    assert.match(c.t, /^\d{4}-\d{2}-\d{2}$/, "봉 " + i + " 의 날짜");
    assert.ok(c.h >= Math.max(c.o, c.c) && c.l <= Math.min(c.o, c.c), "봉 " + i + " 고저가 어긋난다");
  });
  assert.deepEqual(S.price, S.candle.map(c => c.c), "price 는 종가 배열이어야 한다");
});

// 엔진의 synthVolume 은 거래량을 **가격에서** 만든다. 그걸 쓰면 "상승에 거래량이 동반됐다"가
// 동어반복이 되고, 8b 가 거짓으로 판정한 바로 그 모양이 첫 화면에 걸린다.
test("거래량은 가격과 독립이다 — 수익률과 상관이 낮다", () => {
  const r = [], v = [];
  for (let i = 1; i < S.candle.length; i++) {
    r.push(S.candle[i].c / S.candle[i - 1].c - 1);
    v.push(S.candle[i].v);
  }
  const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
  const mr = mean(r), mv = mean(v);
  let num = 0, dr = 0, dv = 0;
  for (let i = 0; i < r.length; i++) {
    num += (r[i] - mr) * (v[i] - mv); dr += (r[i] - mr) ** 2; dv += (v[i] - mv) ** 2;
  }
  const corr = num / Math.sqrt(dr * dv);
  assert.ok(Math.abs(corr) < 0.25, "거래량이 가격에서 파생된 것처럼 보인다: corr=" + corr.toFixed(3));
});

test("파일이 작다 — 첫 화면이 이걸 기다린다", () => {
  const bytes = readFileSync(new URL("../www/onboarding-sample.js", import.meta.url)).length;
  assert.ok(bytes < 120000, "번들 시계가 " + bytes + "바이트다");
});
