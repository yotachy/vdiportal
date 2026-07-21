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

/* 상수 추출 — `const _CONF_HORIZON = ...;` / `const _Q50 = ...;` 형태 한 줄 */
function grabConstLine(marker) {
  const line = SRC.split("\n").find(l => l.includes(marker) && l.trim().startsWith("const "));
  if (!line) throw new Error("상수 줄을 찾지 못함: " + marker);
  return line.trim();
}

const setup = [
  grabConstLine("_CONF_HORIZON"),
  grabFn("_predBandW"),
  grabFn("_predConfAt"),
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
  return { _predBandW, _predConfAt, _predHorizonK, _predPCal, _predWigVal, _predConfSeq, _predQ50, _CONF_HORIZON };
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

/* ── 1. _predBandW / _predConfAt (밴드 상대확장) ── */
ok("bandW: 정상 밴드는 양수, 퇴화 밴드는 0", () => {
  assert.ok(K._predBandW(90, 110) > 0);
  assert.strictEqual(K._predBandW(110, 110), 0);
  assert.strictEqual(K._predBandW(110, 90), 0);
  assert.strictEqual(K._predBandW(0, 110), 0);
  assert.strictEqual(K._predBandW(NaN, 110), 0);
});
ok("conf: 첫 봉은 항상 1", () => {
  assert.strictEqual(K._predConfAt([98, 95, 90], [102, 105, 110], 0), 1);
});
ok("conf: 밴드가 벌어지면 단조 감소(전 국면 보장)", () => {
  const lo = [99, 97, 94, 90, 85], hi = [101, 103, 106, 110, 115];
  let prev = Infinity;
  for (let k = 0; k < lo.length; k++) {
    const c = K._predConfAt(lo, hi, k);
    assert.ok(c <= prev + 1e-12, "k=" + k + " c=" + c + " prev=" + prev);
    assert.ok(c >= 0 && c <= 1);
    prev = c;
  }
  assert.ok(K._predConfAt(lo, hi, 4) < 0.7, "끝값=" + K._predConfAt(lo, hi, 4));
});
ok("conf: 마지막 봉은 항상 0(끝에서 완전 해체)", () => {
  const lo = [99, 97, 94, 90, 85], hi = [101, 103, 106, 110, 115];
  assert.strictEqual(K._predConfAt(lo, hi, 4), 0);
});
ok("conf: 초반에 급확장하면 그만큼 빨리 떨어진다(확장 곡선 모양 반영)", () => {
  const loF = [99, 88, 87, 86, 85], hiF = [101, 113, 114, 114.5, 115];   // 앞에서 몰아 벌어짐
  const loL = [99, 98, 96, 92, 85], hiL = [101, 102, 104, 108, 115];      // 뒤에서 벌어짐
  assert.ok(K._predConfAt(loF, hiF, 1) < K._predConfAt(loL, hiL, 1));
});
ok("conf: 밴드가 전혀 안 벌어지면 감쇠 없음(전 구간 1)", () => {
  const lo = [99, 99, 99], hi = [101, 101, 101];
  for (let k = 0; k < 3; k++) assert.strictEqual(K._predConfAt(lo, hi, k), 1);
});
ok("conf: 퇴화 밴드는 0(NaN 없음)", () => {
  assert.strictEqual(K._predConfAt([100, 100], [100, 100], 1), 0);
  assert.ok(isFinite(K._predConfAt([99, 100], [101, 100], 1)));
});

/* ── 2. _predHorizonK ── */
ok("horizon: 임계 교차 index 반환", () => {
  const lo = [99, 97, 92, 85, 78], hi = [101, 103, 108, 115, 122];
  const k = K._predHorizonK(lo, hi);
  assert.ok(k !== null && k >= 1 && k < lo.length, "k=" + k);
  assert.ok(K._predConfAt(lo, hi, k) < K._CONF_HORIZON);
  assert.ok(K._predConfAt(lo, hi, k - 1) >= K._CONF_HORIZON);
});
ok("horizon: 밴드가 안 벌어지면 null", () => {
  const lo = [99, 99, 99], hi = [101, 101, 101];
  assert.strictEqual(K._predHorizonK(lo, hi), null);
});
ok("horizon: 루프가 k=1 부터 시작한다(seam 겹침 방지 — 소스 직접 확인)", () => {
  const src = grabFn("_predHorizonK");
  assert.ok(/for\s*\(let k = 1;/.test(src), "루프 시작점이 k=1이 아님:\n" + src);
});
ok("horizon: conf(0)은 정의상 1이라 첫 봉은 구조적으로 지평이 될 수 없다", () => {
  assert.strictEqual(K._predConfAt([99, 1], [101, 999], 0), 1);
});
ok("horizon: 빈 배열이면 null", () => {
  assert.strictEqual(K._predHorizonK([], []), null);
});

/* ── 3. _predPCal ── */
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

/* ── 4. _predWigVal (conf 전환) ── */
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

/* ── 5. _predConfSeq ── */
ok("confSeq: conf 길이 = 밴드 길이, 전부 0..1", () => {
  const r = K._predConfSeq([99, 97, 94], [101, 103, 106]);
  assert.strictEqual(r.conf.length, 3);
  for (const v of r.conf) assert.ok(v >= 0 && v <= 1, "v=" + v);
});
ok("confSeq: 지평이 있으면 kEnd = 그 index", () => {
  const lo = [99, 97, 92, 85, 78], hi = [101, 103, 108, 115, 122];
  const r = K._predConfSeq(lo, hi);
  assert.strictEqual(r.kEnd, K._predHorizonK(lo, hi));
  assert.ok(r.kEnd < lo.length, "kEnd=" + r.kEnd);
});
ok("confSeq: 지평이 없으면 kEnd = 전체 길이(점묘 구간 없음)", () => {
  const lo = [99, 99, 99], hi = [101, 101, 101];
  assert.strictEqual(K._predConfSeq(lo, hi).kEnd, 3);
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
