// app-signals — 감지 룰 테스트. 픽스처는 룰이 정확히 발동/억제되도록 조작한 결정적 캔들.
const { test } = require("node:test");
const assert = require("node:assert");
const signals = require("./app-signals.js");

function base(n, price) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(Date.UTC(2026, 7, 20) - (n - 1 - i) * 86400000);
    const t = d.toISOString().slice(0, 10);
    const c = price != null ? price : 100 + 0.05 * i;   // 거의 평탄(오탐 방지)
    out.push({ t: t, o: c, h: c * 1.004, l: c * 0.996, c: c, v: 1000 });
  }
  return out;
}

test("평탄한 시계열: 시그널 없음(오탐 방지)", () => {
  assert.deepEqual(signals.detect("T", base(60)), []);
});

test("거래량 급증: 마지막 봉 거래량 3배 → vol_surge", () => {
  const c = base(60);
  c[59].v = 3000;
  const out = signals.detect("T", c);
  const s = out.filter((x) => x.rule === "vol_surge")[0];
  assert.ok(s, "vol_surge 미발동");
  assert.equal(s.group, "q");
  assert.ok(s.why.indexOf("3배") >= 0);
  assert.equal(s.key, "T|vol_surge|" + c[59].t);
});

test("갭 하락 2% 이상 → gap(dir -1)", () => {
  const c = base(60);
  c[59].o = c[58].c * 0.97;
  c[59].c = c[59].o;
  c[59].l = c[59].o * 0.996; c[59].h = c[58].c;
  const out = signals.detect("T", c);
  const s = out.filter((x) => x.rule === "gap")[0];
  assert.ok(s, "gap 미발동");
  assert.equal(s.dir, -1);
});

test("20일 신고가 돌파 → hh20", () => {
  const c = base(60);
  c[59].c = 120; c[59].h = 121; c[59].o = 101;
  const out = signals.detect("T", c);
  assert.ok(out.some((x) => x.rule === "hh20"), "hh20 미발동");
});

test("변동성 급확대: 당일 고저폭이 평균 ATR 의 2배 → atr_expand", () => {
  const c = base(60);
  c[59].h = c[59].c * 1.03; c[59].l = c[59].c * 0.97;
  const out = signals.detect("T", c);
  assert.ok(out.some((x) => x.rule === "atr_expand"), "atr_expand 미발동");
});

test("scan: 워치리스트 합산·봉 날짜 내림차순·키 결정성", () => {
  const a = base(60); a[59].v = 3000;
  const b = base(59); b[58].v = 3000;   // 하루 짧음 → 이전 날짜
  const out = signals.scan(["A", "B"], { A: a, B: b });
  assert.ok(out.length >= 2);
  assert.ok(out[0].barT >= out[out.length - 1].barT);
  const out2 = signals.scan(["A", "B"], { A: a, B: b });
  assert.deepEqual(out.map((x) => x.key), out2.map((x) => x.key));   // 결정적
});

test("데이터 부족(<30봉)은 빈 배열", () => {
  assert.deepEqual(signals.detect("T", base(20)), []);
});

// ── 확신도 게이트(rankSignal) — 앱 하이라이트와 스캐너 푸시 선별이 같은 함수를 쓴다 ──
// 기대값은 설계서 §4.1에서 직접 계산한다(구현 상수 재사용 금지):
// strength = |prob-50|/50, 기본 문턱 conv=0.30 → prob 65 이상 / 35 이하가 확신.
test("rankSignal: 상승 시그널 + 강한 상승 판정 = 중요", () => {
  const r = signals.rankSignal({ dir: 1 }, { regime: "bull", prob: 70 });
  assert.equal(r.aligned, true);
  assert.equal(r.important, true);
  assert.equal(Math.round(r.score * 100) / 100, 0.4);
});

test("rankSignal: 상승 시그널 + 하락 국면 = 미정렬(중요 아님·score 0)", () => {
  const r = signals.rankSignal({ dir: 1 }, { regime: "bear", prob: 20 });
  assert.equal(r.aligned, false);
  assert.equal(r.important, false);
  assert.equal(r.score, 0);
});

test("rankSignal: 정렬돼도 확신이 약하면 중요 아님", () => {
  const r = signals.rankSignal({ dir: 1 }, { regime: "bull", prob: 58 });
  assert.equal(r.aligned, true);
  assert.equal(r.important, false);   // strength 0.16 < 0.30
});

test("rankSignal: 하락 시그널은 하락 국면과 정렬", () => {
  assert.equal(signals.rankSignal({ dir: -1 }, { regime: "bear", prob: 30 }).important, true);
  assert.equal(signals.rankSignal({ dir: -1 }, { regime: "bull", prob: 80 }).important, false);
});

test("rankSignal: 국면 중립이면 확률 방향으로 정렬 판정", () => {
  assert.equal(signals.rankSignal({ dir: 1 }, { regime: "neutral", prob: 68 }).aligned, true);
  assert.equal(signals.rankSignal({ dir: 1 }, { regime: "neutral", prob: 32 }).aligned, false);
});

test("rankSignal: 방향 없는 룰(거래량·변동성)은 어느 쪽이든 강한 방향관이면 중요", () => {
  assert.equal(signals.rankSignal({ dir: 0 }, { regime: "bear", prob: 25 }).important, true);
  assert.equal(signals.rankSignal({ dir: 0 }, { regime: "neutral", prob: 52 }).important, false);
});

test("rankSignal: 판정이 없으면(엔진 실패) 중요 아님 — 지어내지 않는다", () => {
  assert.equal(signals.rankSignal({ dir: 1 }, null).important, false);
  assert.equal(signals.rankSignal({ dir: 1 }, { regime: "bull" }).important, false);
});

test("rankSignal: 문턱은 POLICY.signal.conv — opts.conv 로 덮어쓸 수 있다", () => {
  assert.equal(require("./app-config.js").POLICY.signal.conv, 0.30);
  assert.equal(signals.rankSignal({ dir: 1 }, { regime: "bull", prob: 58 }, { conv: 0.1 }).important, true);
});
