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
import { allCss } from "./_css.mjs";

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

// 리뷰 I4 — play() 를 부르는 화면(온보딩)이 state.ob6Playing=true 를 먼저 세운 뒤 play() 를
// 부른다. play() 나 그 rAF 콜백(frame())이 던지면 그 플래그가 영원히 안 풀려 앱이 갇힌다.
// 온보딩 쪽 test/onboarding.test.mjs 의 I4 시험은 이 프로젝트의 테스트 하네스가 쓰는 동기
// rAF 스텁(`fn => { fn(); return 1; }`) 위에서 돈다 — 그 스텁은 frame() 을 play() 호출과
// **같은 호출 스택**에서 그 자리에 동기로 실행하므로, frame() 자신에게 try/catch 가
// 없어도 예외가 자연스럽게 play() 호출자의 try/catch 로 넘어간다. 그래서 그 시험만으로는
// "frame() 자신의 try/catch 가 실제로 일을 하는지"를 증명하지 못한다 — 진짜 브라우저의
// requestAnimationFrame 은 **다음 매크로태스크**로 넘어가 호출 스택을 끊는다(리뷰가 지적한
// 바로 그 지점). 여기서는 setTimeout 으로 진짜 비동기 rAF 를 흉내내 그 전제를 재현하고,
// play() 를 부르는 쪽에 **어떤 try/catch 도 두지 않은 채** onError 가 실제로 불리는지 잰다
// — 캐치가 있다면 그건 이 함수(frame) 자신의 것일 수밖에 없다.
test("play() 의 rAF 콜백(frame) 안에서 던지면 onError 로 회수된다 — 호출 스택이 끊긴 진짜 비동기 rAF", async () => {
  const MSUi = require("../www/ui.js");
  const MSStr = require("../www/strings.js");

  // 최소 DOM 스텁 — El(onboarding.test.mjs)의 축약판. play() 가 실제로 건드리는 것만 지원한다:
  // createElement/appendChild/removeChild/classList.add/textContent/style/querySelector.
  class MiniEl {
    constructor(tag) { this.tagName = tag; this.className = ""; this.children = []; this.style = {}; this._text = ""; }
    appendChild(c) { c.parentNode = this; this.children.push(c); return c; }
    removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); c.parentNode = null; return c; }
    get classList() { const self = this; return { add(c) { if ((" " + self.className + " ").indexOf(" " + c + " ") < 0) self.className = (self.className ? self.className + " " : "") + c; } }; }
    addEventListener() {}
    set innerHTML(v) { if (v === "") this.children = []; }
    get innerHTML() { return ""; }
    set textContent(v) { this._text = String(v); }
    get textContent() { return this._text; }
    find(pred) {
      for (const c of this.children) { if (pred(c)) return c; const hit = c.find(pred); if (hit) return hit; }
      return null;
    }
    querySelector(sel) {
      const cls = String(sel).replace(/^\./, "");
      return this.find(c => (" " + c.className + " ").indexOf(" " + cls + " ") >= 0);
    }
  }

  const bodyEl = new MiniEl("body");
  const g = globalThis;
  const saved = {};
  const put = (k, v) => { saved[k] = Object.prototype.hasOwnProperty.call(g, k) ? g[k] : undefined; g[k] = v; };
  put("document", { createElement: t => new MiniEl(t), body: bodyEl, querySelector: sel => bodyEl.querySelector(sel) });
  put("MSUi", MSUi);
  put("MSStr", MSStr);
  put("MSIndicators", IND);
  // 진짜 비동기 — 동기 스텁과 달리 다음 매크로태스크로 넘어가 호출 스택을 끊는다.
  put("requestAnimationFrame", fn => setTimeout(fn, 0));
  put("cancelAnimationFrame", id => clearTimeout(id));

  // 이 프로세스 차원에서 예외가 새 나가면(= frame() 에 자체 try/catch 가 없다는 뜻) 그대로
  // node --test 프로세스를 죽이지 않고 여기서 붙잡아, "새 나갔다"는 사실 자체를 단언으로
  // 바꾼다 — 크래시가 아니라 빨간 시험이 되게 한다.
  let uncaught = null;
  const onUncaught = (e) => { uncaught = e; };
  process.once("uncaughtException", onUncaught);

  try {
    const stepper = {
      total: 5, rows: [],
      get done() { return false; },     // 끝까지 안 끝난다 — step() 이 항상 먼저 던진다
      get index() { return 0; },
      step() { throw new Error("frame boom — 진짜 비동기 rAF 재현"); },
      drain() { throw new Error("frame boom — 진짜 비동기 rAF 재현"); }
    };

    const outcome = await Promise.race([
      new Promise((resolve) => {
        AV.play({
          stepper, basic: 5,
          onDone: (rows) => resolve({ kind: "done", rows }),
          onError: (err) => resolve({ kind: "error", err })
        });
      }),
      new Promise((resolve) => setTimeout(() => resolve({ kind: "timeout" }), 300))
    ]);

    assert.strictEqual(outcome.kind, "error",
      "frame() 안에서 던졌는데 onError 로 안 끝났다(실제: " + outcome.kind + ") — 회수 경로가 없다는 뜻이다");
    assert.match(String(outcome.err && outcome.err.message), /frame boom/,
      "onError 에 넘어온 오류가 실제로 던진 그 오류가 아니다");
    assert.strictEqual(bodyEl.querySelector(".an-scrim"), null, "실패했는데 오버레이(.an-scrim)가 안 지워졌다");
    assert.strictEqual(uncaught, null,
      "예외가 frame() 밖(uncaughtException)으로 새 나갔다 — frame() 자신에게 try/catch 가 없다는 뜻이다");
  } finally {
    process.removeListener("uncaughtException", onUncaught);
    Object.keys(saved).forEach(k => { if (saved[k] === undefined) delete g[k]; else g[k] = saved[k]; });
  }
});

// ── P1b Task 7 — 19a 빗 강조("막 읽은 칸이 가장 진하고, 지난 칸일수록 흐려진다" · "지금
// 읽는 칸은 흰 막대 하나뿐"). toothClass() 는 paint() 가 매 프레임 통째로 다시 쓰는 className
// 을 순수 계산으로 답한다 — DOM·타이머 없이 여기서 잰다(tallyOf 와 같은 이유). ─────────────

test("toothClass — 지금 읽는 칸은 an-now 하나, 막 읽은 칸이 가장 진하고 지날수록 흐려진다", () => {
  // read=5: 0~4 는 이미 읽음(4 가 가장 최근), 5 는 지금, 6 이상은 아직.
  assert.match(AV.toothClass(5, 5, 0), /(^|\s)an-now(\s|$)/, "지금 읽는 칸에 an-now 가 없다");
  assert.doesNotMatch(AV.toothClass(5, 5, 0), /\bon\b/, "아직 안 읽었는데 on 이 붙었다");
  assert.doesNotMatch(AV.toothClass(6, 5, 0), /an-now|\bon\b/, "아직 멀리 남은 칸에 진행 클래스가 붙었다");

  assert.match(AV.toothClass(4, 5, 0), /\bon\b/, "막 읽은 칸(dist 0)에 on 이 없다");
  assert.doesNotMatch(AV.toothClass(4, 5, 0), /an-fade/, "막 읽은 칸이 벌써 흐려져 있다 — 가장 진해야 한다");
  assert.match(AV.toothClass(3, 5, 0), /an-fade1(\s|$)/, "한 칸 전(dist 1)이 an-fade1 이 아니다");
  assert.doesNotMatch(AV.toothClass(3, 5, 0), /an-fade2/, "한 칸 전이 벌써 최대로 흐려졌다");
  assert.match(AV.toothClass(0, 5, 0), /an-fade2(\s|$)/, "더 지난 칸(dist ≥2)이 an-fade2 로 수렴하지 않는다");
});

test("toothClass — 기본 티어(an-core) 칸도 같은 진하기 규칙을 따른다", () => {
  assert.match(AV.toothClass(2, 5, 5), /an-core/, "기본 티어 칸에 an-core 표식이 없다");
  assert.match(AV.toothClass(2, 5, 5), /an-fade2/, "기본 티어 칸도 지나면 흐려져야 한다");
  assert.match(AV.toothClass(3, 3, 5), /(^|\s)an-now(\s|$)/, "기본 티어 구간 안에서도 현재 위치가 표시돼야 한다");
});

// 브리프 원문 시험이 쓰는 렌더 헬퍼 — 실 DOM·타이머 없이 toothClass() 로 빗 하나를 그대로
// 그린다(paint() 가 매 프레임 하는 일과 같은 계산을 화면 없이 재현한 것 — MiniEl 을 새로
// 안 만드는 이유는 이 시험이 클래스 목록만 보면 되기 때문이다).
function renderAnalyzeAt(read, total, basic) {
  const teeth = [];
  for (let i = 0; i < total; i++) teeth.push({ className: AV.toothClass(i, read, basic || 0) });
  return {
    querySelectorAll(sel) {
      const need = String(sel).split(".").filter(Boolean);
      return teeth.filter(t => need.every(c => (" " + t.className + " ").indexOf(" " + c + " ") >= 0));
    },
    querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  };
}

test("19a — 지금 읽는 칸이 읽은 칸·대기 칸과 구별된다", () => {
  const dom = renderAnalyzeAt(12, 32);
  assert.ok(dom.querySelector(".an-tooth.an-now"), "현재 위치 표시가 없다");
  assert.strictEqual(dom.querySelectorAll(".an-tooth.an-now").length, 1,
    "현재 위치가 둘 이상이다");
});

// ── Task 7 리뷰(라운드 1, Minor) — 경계 인덱스: read=0(첫 톱니) · read=total-1(마지막 하나
// 직전) · read=total(완료 후, 현재 위치가 없어야 한다). ──────────────────────────────────

test("경계 — read=0(첫 프레임)에는 an-now 가 0번 칸 하나뿐이고, 뒤로 읽은 칸이 없다", () => {
  const dom = renderAnalyzeAt(0, 32);
  assert.strictEqual(dom.querySelectorAll(".an-tooth.an-now").length, 1, "현재 위치가 0개 또는 여러 개다");
  assert.ok(dom.querySelector(".an-tooth.an-now"), "0번 칸에 an-now 가 없다");
  assert.strictEqual(dom.querySelectorAll(".an-tooth.on").length, 0,
    "아직 하나도 안 읽었는데 이미 읽은(on) 칸이 있다");
});

test("경계 — read=total-1(마지막 칸 직전)에도 현재 위치는 여전히 하나뿐이다", () => {
  const total = 32;
  const dom = renderAnalyzeAt(total - 1, total);
  assert.strictEqual(dom.querySelectorAll(".an-tooth.an-now").length, 1, "현재 위치가 0개 또는 여러 개다");
  assert.strictEqual(dom.querySelectorAll(".an-tooth.on").length, total - 1,
    "마지막 한 칸 빼고 전부 읽었어야 하는데 on 칸 수가 다르다");
});

test("경계 — read=total(완료 후)에는 현재 위치 표시가 없다 — 다 읽었으니 '지금' 이 없다", () => {
  const total = 32;
  const dom = renderAnalyzeAt(total, total);
  assert.strictEqual(dom.querySelectorAll(".an-tooth.an-now").length, 0,
    "다 읽었는데도 an-now 가 남아 있다");
  assert.strictEqual(dom.querySelectorAll(".an-tooth.on").length, total,
    "다 읽었는데 on 이 아닌 칸이 있다");
});

// ── Task 7 리뷰(라운드 1, Important) — CSS 소스 순서. 같은 특이성(.an-tooth.an-core 와
// .an-tooth.an-now 둘 다 2클래스, 0,2,0)인 두 규칙은 **소스에서 나중에 오는 쪽이 이긴다.**
// 리뷰 실측: 두 규칙 순서를 뒤집으면 getComputedStyle 이 배경을 steel(rgb(136,146,166))·
// 높이 26px 로 돌려줬다(흰 막대 소실) — 이 노드 시험은 실제 캐스케이드를 계산하지 못하지만
// (getComputedStyle 이 없다), 이 저장소의 기존 관례(test/shell.test.mjs:91-92 의
// `s.indexOf(a) < s.indexOf(b)`)와 같은 방식으로 **소스 순서**를 고정해 그 사고가 다시
// 조용히 나지 않게 한다. ────────────────────────────────────────────────────────────────
const CSS = allCss();

test("CSS 순서 — .an-tooth.an-now 는 .an-tooth.an-core 뒤에 온다(동특이성 동점은 소스 순서로 갈린다)", () => {
  const core = CSS.indexOf(".an-tooth.an-core {");
  const now = CSS.indexOf(".an-tooth.an-now {");
  assert.ok(core >= 0, ".an-tooth.an-core 규칙을 못 찾았다 — 선택자 표기가 바뀌었다");
  assert.ok(now >= 0, ".an-tooth.an-now 규칙을 못 찾았다 — 선택자 표기가 바뀌었다");
  assert.ok(core < now,
    ".an-tooth.an-now 가 .an-tooth.an-core 보다 먼저 선언됐다 — 두 규칙은 같은 특이성(0,2,0)이라 " +
    "소스 순서가 승부를 가른다. 이 순서면 기본 티어 구간(an-core)에서 흰 막대(an-now)가 " +
    "steel 에 덮여 사라진다(Task 7 리뷰 실측: bg=rgb(136,146,166)·h=26px)");
});

test("변이 증명 — .an-tooth.an-core/.an-tooth.an-now 두 규칙의 소스 순서를 실제로 뒤집으면 위 검사가 빨개진다", () => {
  const coreStart = CSS.indexOf(".an-tooth.an-core {");
  const coreEnd = CSS.indexOf("}", coreStart) + 1;
  const coreRule = CSS.slice(coreStart, coreEnd);
  const nowStart = CSS.indexOf(".an-tooth.an-now {");
  const nowEnd = CSS.indexOf("}", nowStart) + 1;
  const nowRule = CSS.slice(nowStart, nowEnd);
  assert.ok(coreStart < nowStart, "전제(정상 순서)가 이미 깨져 있다 — 이 시험 자체가 성립하지 않는다");
  const between = CSS.slice(coreEnd, nowStart);
  // 두 규칙 텍스트만 서로 자리를 맞바꾼다(사이 내용·나머지 파일은 그대로) — 실제로 파일
  // 순서를 뒤집었을 때와 같은 문자열 결과를 만든다.
  const swapped = CSS.slice(0, coreStart) + nowRule + between + coreRule + CSS.slice(nowEnd);
  const swappedCore = swapped.indexOf(".an-tooth.an-core {");
  const swappedNow = swapped.indexOf(".an-tooth.an-now {");
  assert.ok(swappedCore > swappedNow,
    "규칙을 맞바꿨는데도 core 가 여전히 now 보다 먼저다 — 맞바꾸기 자체가 잘못됐다(변이가 공허하다)");
  // 위 검사와 같은 술어를 변이 표본에 적용 — 뒤집힌 순서에서는 반드시 실패해야 한다.
  assert.ok(!(swappedCore < swappedNow),
    "순서가 뒤집혔는데도 '정상' 판정을 내렸다 — 이 검사는 실제로는 순서를 못 잡는다");
});
