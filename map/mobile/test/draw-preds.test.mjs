import { test } from "node:test";
import assert from "node:assert";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const P = require("../www/draw-preds.js");

// 밴드가 벌어지는 예측(신뢰도가 실제로 감쇠하는 형태)
function band(n) {
  const lo = [], hi = [], vals = [];
  for (let k = 0; k < n; k++) { vals.push(100 + k * 0.4); lo.push(100 - (k + 1) * 0.9); hi.push(100 + (k + 1) * 1.1); }
  return { vals, lo, hi };
}
const LEVELS = [98, 101, 104, 107];
const TEX = Array.from({ length: 25 }, (_, i) => Math.sin(i * 0.7) * 0.01);

test("seed 는 심볼+주기에 결정론적이고, 다르면 갈라진다", () => {
  assert.equal(P.seed("AAPL", "1day"), P.seed("AAPL", "1day"));
  assert.notEqual(P.seed("AAPL", "1day"), P.seed("MSFT", "1day"));
  assert.notEqual(P.seed("AAPL", "1day"), P.seed("AAPL", "1week"));
  assert.ok(Number.isInteger(P.seed("AAPL", "1day")) && P.seed("AAPL", "1day") >= 0);
});

test("confAt 은 0..1 유한값이고 밴드가 벌어질수록 단조 감소한다", () => {
  const { lo, hi } = band(24);
  let prev = Infinity;
  for (let k = 0; k < 24; k++) {
    const v = P.confAt(lo, hi, k);
    assert.ok(isFinite(v) && v >= 0 && v <= 1, "k=" + k + " conf=" + v);
    assert.ok(v <= prev + 1e-12, "k=" + k + " 에서 신뢰도가 되레 올라갔다");
    prev = v;
  }
});

test("confSeq 는 길이를 보존하고 kEnd 를 0..n 안에 둔다", () => {
  const { lo, hi } = band(24);
  const cs = P.confSeq(lo, hi);
  assert.equal(cs.conf.length, 24);
  assert.ok(cs.kEnd > 0 && cs.kEnd <= 24, "kEnd=" + cs.kEnd);
  assert.ok(cs.conf.every(isFinite));
});

test("confSeq 는 밴드가 안 벌어지면 감쇠 없이 전부 1 · kEnd=n", () => {
  const lo = [99, 99, 99], hi = [101, 101, 101];
  const cs = P.confSeq(lo, hi);
  assert.deepEqual(cs.conf, [1, 1, 1]);
  assert.equal(cs.kEnd, 3);
});

test("wiggle 은 같은 시드·입력이면 같은 수열을 준다 — 프레임마다 흔들리면 지직거린다", () => {
  const { vals, lo, hi } = band(24);
  const a = P.wiggle(24, vals, lo, hi, LEVELS, TEX, 12345);
  const b = P.wiggle(24, vals, lo, hi, LEVELS, TEX, 12345);
  assert.deepEqual(a, b);
});

test("wiggle 은 시드가 다르면 다른 수열을 준다", () => {
  const { vals, lo, hi } = band(24);
  const a = P.wiggle(24, vals, lo, hi, LEVELS, null, 1);
  const b = P.wiggle(24, vals, lo, hi, LEVELS, null, 999);
  assert.notDeepEqual(a, b);
});

test("wiggle 은 길이를 보존하고 NaN 을 내지 않으며 밴드 안에 머문다", () => {
  const { vals, lo, hi } = band(24);
  const w = P.wiggle(24, vals, lo, hi, LEVELS, TEX, 7);
  assert.equal(w.length, 24);
  w.forEach((v, k) => {
    assert.ok(isFinite(v), "k=" + k + " 가 NaN");
    assert.ok(v >= lo[k] - 1e-9 && v <= hi[k] + 1e-9, "k=" + k + " 가 밴드 밖: " + v);
  });
});

test("tex·levels 가 둘 다 없으면 원본 vals 를 그대로 돌려준다 — 결을 지어내지 않는다", () => {
  const { vals, lo, hi } = band(24);
  assert.deepEqual(P.wiggle(24, vals, lo, hi, null, null, 7), vals);
  assert.deepEqual(P.wiggle(24, vals, lo, hi, [], undefined, 7), vals);
});

test("tex 만 없어도 levels 가 있으면 계산한다 — 꿈틀의 주항은 S/R 반응이다", () => {
  const { vals, lo, hi } = band(24);
  const w = P.wiggle(24, vals, lo, hi, LEVELS, null, 7);
  assert.ok(w.some((v, k) => Math.abs(v - vals[k]) > 1e-9), "levels 가 있는데 매끈하다");
});

test("wigSeq 는 레벨 위에서 반응이 최대, 레벨 사이에서 최소다", () => {
  // 100→110 등간격 램프 · 레벨 [100,110] → k=0 은 레벨 위(|pull|=1), k=5 는 정확히 중간(pull≈0)
  const n = 11, vals = Array.from({ length: n }, (_, k) => 100 + k);
  const lo = vals.map(v => v - 2), hi = vals.map(v => v + 2);
  const seq = P.wigSeq(n, vals, lo, hi, [100, 110], null, 42);
  assert.equal(seq.length, n);
  assert.ok(seq.every(v => isFinite(v) && Math.abs(v) <= 1 + 1e-9), "[-1,1] 정규화가 깨졌다");
  assert.ok(Math.abs(seq[0]) > Math.abs(seq[5]), "레벨 위 반응이 레벨 사이보다 작다");
});
