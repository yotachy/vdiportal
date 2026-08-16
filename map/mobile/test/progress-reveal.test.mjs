// P2 §7 — 해제 직후 전환 장면(시안 8b).
//
// 이 화면의 계약은 **타이밍**이다. 그리고 그 규칙은 19a(분석 진행 중계)와 **정반대**라,
// 두 화면을 한 컴포넌트로 묶는 순간 한쪽 규칙이 조용히 다른 쪽에 샌다(인벤토리 §0 충돌 8).
//   19a — 캐시로 0.3초에 끝나면 0.3초에 끝낸다(늘리지 않는다)
//   8b  — 서버가 더 빨라도 끝까지 재생한다(줄이지 않는다)
import { test } from "node:test";
import assert from "node:assert";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const R = require("../www/progress-reveal.js");
const G = require("../www/graph.js");
const FC = require("../../forge-core.js");
const S = require("../www/strings.js");

const SRC = readFileSync(new URL("../www/progress-reveal.js", import.meta.url), "utf8");
const REPORT = readFileSync(new URL("../www/screens/report.js", import.meta.url), "utf8");

test("최소 재생 시간이 있다 — 계산이 더 빨라도 줄이지 않는다", () => {
  assert.strictEqual(R.MIN_MS, 3000, "시안 8b 의 3초가 아니다");
  const mid = R.stateAt(1500, 32, 5);
  assert.strictEqual(mid.done, false, "절반 시점에 이미 끝났다고 답한다");
  assert.ok(mid.lit > 5 && mid.lit < 32, "중간 상태가 양 끝에 붙어 있다: " + mid.lit);
});

test("끝나면 전부 켜져 있다 — 덜 켜진 채 결과로 넘어가지 않는다", () => {
  const end = R.stateAt(R.MIN_MS, 32, 5);
  assert.strictEqual(end.done, true);
  assert.strictEqual(end.lit, 32);
  const over = R.stateAt(R.MIN_MS * 3, 32, 5);
  assert.strictEqual(over.lit, 32, "시간이 지나도 칸 수를 넘어선다");
});

test("시작 시점에는 기본 티어가 읽던 만큼만 켜져 있다", () => {
  const s0 = R.stateAt(0, 32, 5);
  assert.strictEqual(s0.lit, 5, "처음부터 전부 켜져 있으면 '무엇이 열렸는지'가 안 보인다");
  assert.strictEqual(R.stateAt(-100, 32, 5).lit, 5, "음수 시각(시계 어긋남)이 그대로 샌다");
});

// 19a 와 8b 는 다른 파일이어야 한다. 지금 19a 는 아직 없다 — 생겼을 때 이 단정이
// "한 파일에 넣지 말라"를 대신 말한다.
test("타이밍 정책을 19a 와 공유하지 않는다 — 파일이 다르고, 서로를 참조하지 않는다", () => {
  assert.ok(SRC.indexOf("MSProgressLive") < 0, "8b 가 19a 모듈을 참조한다");
  assert.ok(!/mode\s*[=:]\s*["'](live|reveal)["']/.test(SRC),
    "한 모듈에 mode 플래그로 두 규칙을 담고 있다 — 규칙이 서로 샌다");
  const live = new URL("../www/progress-live.js", import.meta.url);
  if (existsSync(live)) {
    const LIVE = readFileSync(live, "utf8");
    assert.ok(LIVE.indexOf("MSReveal") < 0, "19a 가 8b 를 참조한다 — 타이밍이 섞인다");
    assert.ok(LIVE.indexOf("MIN_MS") < 0, "19a 에 최소 재생 시간이 있다 — 진행 중계를 일부러 늘린다");
  }
});

// 숫자를 지어내지 않는다. 빗 칸 수는 엔진에서, 스틸 칸은 기본 티어에서 온다.
test("칸 수는 엔진과 기본 티어에서 유도된다 — 32·5 를 화면이 다시 적지 않는다", () => {
  assert.match(REPORT, /total: ForgeCore\.indicatorCount, basic: MSGraph\.BASIC\.length/,
    "빗 칸 수를 리터럴로 넘긴다");
  assert.ok(!/\b32\b/.test(S.t.rvOpened + S.t.rvCaption), "문구에 32 가 박혀 있다");
  assert.strictEqual(FC.indicatorCount - G.BASIC.length, 27,
    "오늘의 '열리는 개수'가 27 이 아니다 — 화면은 유도값을 쓰므로 자동으로 맞지만 시안 대조가 필요하다");
});

test("연출을 위해 엔진을 다시 돌리지 않는다 — 기다리는 시간은 사용자 것이다", () => {
  // 주석은 뺀다 — 이 모듈의 주석이 "analyzeX 를 32번 더 돌리지 않는다"고 **설명**하고 있어서,
  // 그대로 세면 근거를 적을수록 빨개진다(설명을 지우게 만드는 관문은 관문이 아니다).
  const code = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'\\])\/\/[^\n]*/gm, (m, p) => p);
  ["MSIndicators.readings", "analyzeX", "ForgeCore.run"].forEach(bad =>
    assert.ok(code.indexOf(bad) < 0, "연출 모듈이 " + bad + " 를 부른다"));
  assert.match(REPORT, /agree: conf \? conf\.agree : null/,
    "동의 수를 판정이 이미 계산한 confluence 에서 안 가져온다");
});

test("탭하면 즉시 끝난다 — 연출에 사용자를 앉혀두지 않는다", () => {
  assert.match(SRC, /scrim\.addEventListener\("click", finish\)/, "탭 스킵이 없다");
  assert.match(SRC, /if \(finished\) return;/, "두 번 끝나면 onDone 이 두 번 불린다");
  assert.ok(S.t.rvSkip && S.t.rvSkip.indexOf("탭") >= 0, "탭하면 넘어간다는 안내가 없다");
});

test("성공 직후에만 재생된다 — 실패·환급 경로는 연출로 가지 않는다", () => {
  const at = REPORT.indexOf("MSReveal.play");
  const success = REPORT.indexOf('if (r.kind === "success")');
  const refunded = REPORT.indexOf('r.kind === "refunded"');
  assert.ok(success > 0 && at > success && at < refunded,
    "연출 호출이 성공 분기 안에 있지 않다");
});
