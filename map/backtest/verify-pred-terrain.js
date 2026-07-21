/* forge-draw.js 실소스 추출 검증 — 예측 불확실성 지형 순수 함수.
   forge-draw.js는 브라우저 전용(IIFE·DOM 의존)이라 require 불가 → 함수 소스만 텍스트에서 잘라 eval 한다. */
"use strict";
const fs = require("fs");
const path = require("path");
const assert = require("assert");

const SRC = fs.readFileSync(path.join(__dirname, "..", "forge-draw.js"), "utf8");

/* 이름으로 함수 소스 추출(중괄호 균형 매칭). 실패하면 즉시 에러 — 함수명이 바뀌면 검증이 조용히 통과하지 않게. */
function grabFn(name) {
  const at = SRC.indexOf("function " + name + "(");
  if (at < 0) throw new Error("함수를 찾지 못함: " + name);
  let i = SRC.indexOf("{", at), depth = 0;
  for (let j = i; j < SRC.length; j++) {
    if (SRC[j] === "{") depth++;
    else if (SRC[j] === "}") { depth--; if (depth === 0) return SRC.slice(at, j + 1); }
  }
  throw new Error("중괄호 불균형: " + name);
}

/* 상수 추출 — `const _Z_LO = 0.08, _Z_HI = 0.50, _Z_HORIZON = 0.25;` 형태 한 줄 */
function grabConstLine(marker) {
  const line = SRC.split("\n").find(l => l.includes(marker) && l.trim().startsWith("const "));
  if (!line) throw new Error("상수 줄을 찾지 못함: " + marker);
  return line.trim();
}

const sandbox = {};
const setup = [
  grabConstLine("_Z_HORIZON"),
  grabFn("_predZ"),
  grabFn("_predConf"),
  grabFn("_predHorizonK"),
  grabFn("_predPCal"),
  grabFn("_predWigVal"),
  grabFn("_predConfSeq"),
  grabConstLine("_Q50"),
  grabFn("_predQ50"),
].join("\n");

const harness = new Function("stub", `
  const _upProb = stub._upProb, ForgeCore = stub.ForgeCore;
  ${setup}
  return { _predZ, _predConf, _predHorizonK, _predPCal, _predWigVal, _predConfSeq, _predQ50, _Z_LO, _Z_HI, _Z_HORIZON };
`);

/* 스텁: 실제 forge-app.js/_forge-core.js 구현과 동일 수식 */
function _normCdf(z) { const t = 1 / (1 + 0.2316419 * Math.abs(z)), d = 0.3989423 * Math.exp(-z * z / 2); let p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return z > 0 ? 1 - p : p; }
const stub = {
  _upProb(pred, hi, anchor) {
    if (!(pred > 0 && hi > 0 && anchor > 0)) return 50;
    const m = Math.log(pred / anchor), sd = Math.log(hi / pred);
    return Math.round(_normCdf(m / (sd || 1e-6)) * 100);
  },
  ForgeCore: {
    calibrateUpProb(p) {
      if (p == null || !isFinite(p)) return p;
      const q = Math.min(0.999, Math.max(0.001, p / 100)), A = 0.2117, B = 0.3501;
      return Math.round((1 / (1 + Math.exp(-(A * Math.log(q / (1 - q)) + B)))) * 100);
    }
  }
};

const K = harness(stub);
let pass = 0;
function ok(name, fn) { fn(); pass++; console.log("  ok  " + name); }

/* ── 1. _predZ ── */
ok("z: 정상 입력에서 양수", () => {
  const z = K._predZ(110, 120, 100);
  assert.ok(z > 0 && isFinite(z), "z=" + z);
});
ok("z: 밴드가 넓어지면 감소(지평 감쇠의 근원)", () => {
  const near = K._predZ(102, 104, 100);   // 변위 2%, 밴드 2%
  const far = K._predZ(104, 120, 100);    // 변위 4%, 밴드 15%
  assert.ok(near > far, "near=" + near + " far=" + far);
});
ok("z: hi <= center 면 0", () => {
  assert.strictEqual(K._predZ(110, 110, 100), 0);
  assert.strictEqual(K._predZ(110, 90, 100), 0);
});
ok("z: 비유한/0/음수 입력이면 0", () => {
  assert.strictEqual(K._predZ(NaN, 120, 100), 0);
  assert.strictEqual(K._predZ(110, 120, 0), 0);
  assert.strictEqual(K._predZ(-5, 120, 100), 0);
});
ok("z: 하락 예측도 양수(절대값)", () => {
  assert.ok(K._predZ(90, 95, 100) > 0);
});

/* ── 2. _predConf ── */
ok("conf: Z_LO 이하면 0, Z_HI 이상이면 1", () => {
  assert.strictEqual(K._predConf(0), 0);
  assert.strictEqual(K._predConf(K._Z_LO), 0);
  assert.strictEqual(K._predConf(K._Z_HI), 1);
  assert.strictEqual(K._predConf(99), 1);
});
ok("conf: 중간은 선형", () => {
  const mid = (K._Z_LO + K._Z_HI) / 2;
  assert.ok(Math.abs(K._predConf(mid) - 0.5) < 1e-9);
});

/* ── 3. _predHorizonK ── */
ok("horizon: 임계 교차 index 반환", () => {
  const anchor = 100;
  const center = [102, 104, 105, 106, 106];
  const hi = [103, 108, 118, 130, 145];   // 뒤로 갈수록 밴드 폭발 → z 급감
  const k = K._predHorizonK(center, hi, anchor);
  assert.ok(k !== null && k >= 1 && k < center.length, "k=" + k);
  assert.ok(K._predZ(center[k], hi[k], anchor) < K._Z_HORIZON);
  assert.ok(K._predZ(center[k - 1], hi[k - 1], anchor) >= K._Z_HORIZON);
});
ok("horizon: 끝까지 신뢰 유지면 null", () => {
  const center = [110, 120, 130], hi = [111, 121, 131];
  assert.strictEqual(K._predHorizonK(center, hi, 100), null);
});
ok("horizon: k=0 은 절대 반환하지 않음(seam 겹침 방지)", () => {
  const center = [100.0001, 100.0001, 100.0001], hi = [200, 200, 200];   // 첫 봉부터 무신뢰
  const k = K._predHorizonK(center, hi, 100);
  assert.ok(k === null || k >= 1, "k=" + k);
});
ok("horizon: 빈 배열이면 null", () => {
  assert.strictEqual(K._predHorizonK([], [], 100), null);
});

/* ── 4. _predPCal ── */
ok("pCal: 상승 예측이면 상승확률 그대로", () => {
  const center = [110], hi = [115], anchor = 100;
  const raw = stub._upProb(110, 115, 100), cal = stub.ForgeCore.calibrateUpProb(raw);
  assert.strictEqual(K._predPCal(center, hi, anchor, 0), cal);
});
ok("pCal: 하락 예측이면 100 - 상승확률", () => {
  const center = [90], hi = [95], anchor = 100;
  const raw = stub._upProb(90, 95, 100), cal = stub.ForgeCore.calibrateUpProb(raw);
  assert.strictEqual(K._predPCal(center, hi, anchor, 0), 100 - cal);
});
ok("pCal: 50% 미만이 나올 수 있다(정직성 — 반대 우세를 숨기지 않음)", () => {
  const center = [99.5], hi = [125], anchor = 100;   // 약한 하락 예측 + 넓은 밴드
  const p = K._predPCal(center, hi, anchor, 0);
  assert.ok(p < 50, "p=" + p);
});
ok("pCal: 항상 0~100 정수", () => {
  for (const [cv, hv] of [[110, 115], [90, 95], [100.01, 400], [1, 2]]) {
    const p = K._predPCal([cv], [hv], 100, 0);
    assert.ok(Number.isInteger(p) && p >= 0 && p <= 100, "p=" + p);
  }
});

/* ── 5. _predWigVal (conf 전환) ── */
ok("wigVal: conf=0 이면 꿈틀 없음(center 그대로)", () => {
  assert.strictEqual(K._predWigVal(100, 90, 110, 1, 0), 100);
  assert.strictEqual(K._predWigVal(100, 90, 110, -1, 0), 100);
});
ok("wigVal: conf=1 이면 최대 진폭 = 국소 밴드 반폭의 0.5배", () => {
  // amp = 0.5 * ((hi-lo)/2) = 0.5 * 10 = 5
  assert.strictEqual(K._predWigVal(100, 90, 110, 1, 1), 105);
  assert.strictEqual(K._predWigVal(100, 90, 110, -1, 1), 95);
});
ok("wigVal: conf 생략(null/undefined)이면 1로 취급", () => {
  assert.strictEqual(K._predWigVal(100, 90, 110, 1, null), 105);
  assert.strictEqual(K._predWigVal(100, 90, 110, 1), 105);
});
ok("wigVal: 밴드 밖으로 절대 나가지 않음(하드 클램프)", () => {
  assert.strictEqual(K._predWigVal(109, 90, 110, 1, 1), 110);
  assert.strictEqual(K._predWigVal(91, 90, 110, -1, 1), 90);
});
ok("wigVal: 시그니처에서 k/futW가 제거됐다(옛 호출 잔존 방지)", () => {
  assert.strictEqual(K._predWigVal.length, 5, "인자 수=" + K._predWigVal.length);
});

/* ── 6. _predConfSeq ── */
ok("confSeq: conf 길이 = center 길이, 전부 0..1", () => {
  const r = K._predConfSeq([102, 104, 105], [103, 108, 118], 100);
  assert.strictEqual(r.conf.length, 3);
  for (const v of r.conf) assert.ok(v >= 0 && v <= 1, "v=" + v);
});
ok("confSeq: 지평이 있으면 kEnd = 그 index", () => {
  const center = [102, 104, 105, 106, 106], hi = [103, 108, 118, 130, 145];
  const r = K._predConfSeq(center, hi, 100);
  assert.strictEqual(r.kEnd, K._predHorizonK(center, hi, 100));
  assert.ok(r.kEnd < center.length, "kEnd=" + r.kEnd);
});
ok("confSeq: 지평이 없으면 kEnd = 전체 길이(점묘 구간 없음)", () => {
  const center = [110, 120, 130], hi = [111, 121, 131];
  assert.strictEqual(K._predConfSeq(center, hi, 100).kEnd, 3);
});

/* ── 6. 분위수 층 ── */
ok("q50: lo < q50lo < path < q50hi < hi 순서", () => {
  const r = K._predQ50(100, 90, 115);
  assert.ok(90 < r.lo && r.lo < 100 && 100 < r.hi && r.hi < 115,
    JSON.stringify(r));
});
ok("q50: 밴드가 넓어지면 50% 층도 넓어진다", () => {
  const narrow = K._predQ50(100, 98, 102), wide = K._predQ50(100, 80, 125);
  assert.ok((wide.hi - wide.lo) > (narrow.hi - narrow.lo));
});
ok("q50: hi <= path 같은 퇴화 입력이면 path 로 붕괴(NaN 없음)", () => {
  const r = K._predQ50(100, 90, 100);
  assert.ok(isFinite(r.lo) && isFinite(r.hi));
  assert.strictEqual(r.hi, 100);
});
ok("q50: 결과는 항상 [lo, hi] 안", () => {
  const r = K._predQ50(100, 99, 101);
  assert.ok(r.lo >= 99 && r.hi <= 101);
});

console.log("\n" + pass + "/" + pass + " 통과");
