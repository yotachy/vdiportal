"use strict";
const { test } = require("node:test");
const assert = require("node:assert");
const F = require("./feat-lib.js");

function synth(n) {   // 결정적 사인 합성 시계열
  const p = [100];
  for (let i = 1; i < n; i++) p.push(Math.max(1, p[i - 1] * (1 + 0.0005 + Math.sin(i * 0.7) * 0.01 + Math.cos(i * 0.13) * 0.007)));
  return p;
}

test("structFeats: 워밍업 미달 → null, 이후 12개 유한값", () => {
  const p = synth(400);
  assert.equal(F.structFeats(p, 279), null);
  const x = F.structFeats(p, 350);
  assert.equal(x.length, 12);
  assert.equal(F.FEAT_NAMES.length, 12);
  x.forEach(v => assert.ok(isFinite(v)));
});

test("logitFit: 선형분리 데이터 분리 + 결정론", () => {
  const X = [], y = [];
  for (let i = 0; i < 200; i++) { const c = i % 2; X.push([c * 2 - 1 + Math.sin(i) * 0.1]); y.push(c); }
  const m1 = F.logitFit(X, y), m2 = F.logitFit(X, y);
  assert.ok(m1.predict([-1]) < 0.2); assert.ok(m1.predict([1]) > 0.8);
  assert.deepEqual(m1.W, m2.W);   // 결정론
});

test("acc/splitIdx 기본 동작", () => {
  assert.equal(F.acc([0.9, 0.1], [1, 0]), 1);
  assert.equal(F.splitIdx(100, 0.6), 60);
});
