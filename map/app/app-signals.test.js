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
