// 분석 진행 중계(시안 19a) — P2 T11.
//
// 이 화면의 정직성은 전부 "무엇에 묶여 있는가"에 있다. 진행 칸이 오르는 이유가 시간이면
// 그것은 중계가 아니라 연출이고, 사용자는 계산이 진행 중이라고 잘못 읽는다. 그래서 여기서
// 재는 것은 모양이 아니라 성질 넷이다:
//   ① 최소 재생 시간이 없다(8b 의 MIN_MS 가 이 파일로 새지 않았다)
//   ② 8b 를 참조하지 않는다(두 모듈이 합쳐지지 않았다)
//   ③ 진행은 실제 analyzeX 호출 횟수를 따라간다 — 반복자가 그 계약이다
//   ④ 건너뛰기는 연출만 건너뛴다 — 남은 지표를 버리지 않는다
import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const AV = require("../www/progress-analyze.js");
const IND = require("../www/indicators.js");
const SRC = readFileSync(new URL("../www/progress-analyze.js", import.meta.url), "utf8");
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

test("최소 재생 시간이 없다 — 8b 의 규칙이 이 파일로 새지 않았다", () => {
  assert.equal(AV.MIN_MS, undefined, "19a 에 MIN_MS 가 생겼다 — 캐시가 뜨거워도 시간을 채우게 된다");
  // 통과하면 안 되는 형태: 경과 시간을 목표치와 견주는 모든 꼴. 프레임 예산(쓰는 상한)은
  // 남아야 하므로 이름이 아니라 **비교 방향**으로 가른다.
  assert.doesNotMatch(CODE, /MIN_?MS|minMs|elapsed\s*[<>]=?\s*\d|Math\.max\(\s*\d+\s*,\s*(now|elapsed)/,
    "경과 시간을 하한과 견주는 코드가 있다 — 19a 는 시간을 채우지 않는다");
});

test("8b 를 참조하지 않는다 — 규칙이 반대인 두 모듈은 섞이지 않는다", () => {
  assert.doesNotMatch(CODE, /MSReveal|progress-reveal|rv-/,
    "19a 가 8b 를 참조한다 — 한쪽의 타이밍 정책이 다른 쪽으로 샌다");
});

// 가짜 반복자 — 실제 엔진 없이 "몇 번 불렸나"만 센다. 화면이 시간이 아니라 호출에 묶여
// 있다는 것을 재려면 호출 횟수가 관찰 가능해야 한다.
function fakeStepper(n) {
  let i = 0;
  const rows = [];
  return {
    total: n, rows, calls: 0,
    get done() { return i >= n; },
    get index() { return i; },
    step() {
      if (i >= n) return null;
      this.calls++;
      const row = { type: "rsi", bias: (i % 3) - 1, text: "t" + i };
      i++; rows.push(row); return row;
    },
    drain() { while (i < n) this.step(); return rows; }
  };
}

test("집계는 읽은 행만 센다 — 아직 안 읽은 지표를 미리 세지 않는다", () => {
  const st = fakeStepper(9);
  assert.deepEqual(AV.tallyOf(st.rows), { up: 0, flat: 0, down: 0 }, "한 번도 안 읽었는데 집계가 있다");
  st.step(); st.step(); st.step();
  const t = AV.tallyOf(st.rows);
  assert.equal(t.up + t.flat + t.down, 3, "읽은 수와 집계 합이 다르다");
});

test("집계의 중립 판정은 지표 EPS 를 따른다 — 0 과 '못 읽음'을 뭉개지 않는다", () => {
  const rows = [{ bias: IND.EPS / 2 }, { bias: IND.EPS * 2 }, { bias: -IND.EPS * 2 }, { bias: null }];
  const t = AV.tallyOf(rows, IND.EPS);
  assert.deepEqual(t, { up: 1, flat: 1, down: 1 },
    "EPS 안쪽은 횡보, 바깥은 방향, bias 없는 행은 어느 칸에도 안 들어가야 한다");
});

test("반복자는 지표 하나에 analyzeX 를 한 번만 부른다 — 중계 비용이 사용자 시간이 되지 않는다", () => {
  // 실제 엔진으로 잰다. 같은 그래프를 readings() 로 한 번, 반복자로 한 번 돌려 결과가
  // 같아야 한다 — 경로가 둘이면 화면이 보여준 것과 리포트가 쓰는 것이 갈릴 수 있다.
  const FC = require("../../forge-core.js");
  const price = Array.from({ length: 220 }, (_, i) => 100 + Math.sin(i / 7) * 5 + i * 0.05);
  const candle = price.map((c, i) => ({ t: "2026-01-01", o: c, h: c + 1, l: c - 1, c, v: 1000 + i }));
  const data = { price, candle, volume: candle.map(c => c.v) };
  const graph = { nodes: ["ma", "rsi", "macd", "bollinger"].map((b, i) => ({ id: "n" + i, blockType: b, params: {} })) };
  const ctx = IND.ctxFrom(data);

  const viaLoop = IND.readings(FC, graph, data, ctx);
  const st = IND.readingStepper(FC, graph, data, ctx);
  assert.equal(st.total, 4, "반복자가 세는 지표 수가 그래프와 다르다");
  const viaStep = st.drain();
  assert.deepEqual(viaStep.map(r => r.type), viaLoop.map(r => r.type), "두 경로의 지표 목록이 다르다");
  assert.deepEqual(viaStep.map(r => r.bias), viaLoop.map(r => r.bias), "두 경로의 방향이 다르다");
  assert.deepEqual(viaStep.map(r => r.text), viaLoop.map(r => r.text), "두 경로의 판독문이 다르다");
});

test("반복자는 한 걸음에 하나씩만 읽는다 — 진행이 실제 계산을 앞지르지 않는다", () => {
  const FC = require("../../forge-core.js");
  const price = Array.from({ length: 220 }, (_, i) => 100 + i * 0.1);
  const candle = price.map(c => ({ t: "2026-01-01", o: c, h: c + 1, l: c - 1, c, v: 1000 }));
  const data = { price, candle, volume: candle.map(c => c.v) };
  const graph = { nodes: ["ma", "rsi", "macd"].map((b, i) => ({ id: "n" + i, blockType: b, params: {} })) };
  const st = IND.readingStepper(FC, graph, data, IND.ctxFrom(data));
  assert.equal(st.index, 0, "읽기 전인데 진행이 0 이 아니다");
  st.step();
  assert.equal(st.index, 1, "한 걸음에 둘 이상 읽었다");
  assert.equal(st.done, false);
  st.drain();
  assert.equal(st.done, true, "끝까지 읽었는데 done 이 아니다");
  assert.equal(st.index, st.total);
});

test("건너뛰기는 연출만 건너뛴다 — 남은 지표를 버리지 않는다", () => {
  // 화면의 탭 처리는 st.drain() 후 finish() 다. 그 계약을 소스에서 확인한다:
  // drain 없이 끝내면 리포트가 일부만 읽은 목록으로 "32개 중 24개"를 말하게 된다.
  const tap = CODE.match(/addEventListener\("click"[\s\S]{0,120}/);
  assert.ok(tap, "탭 처리를 못 찾았다");
  assert.match(tap[0], /drain\(\)/,
    "탭했을 때 남은 지표를 마저 읽지 않는다 — 분석이 잘린 채 결과로 넘어간다");
});
