import { test } from "node:test";
import assert from "node:assert";

// 심화 리포트 「한 문장으로」(report-model.js sentence())의 과열·저항 절 문턱을 잠근다.
// tools/measure-sentence-signals.mjs 의 measure() 를 그대로 재사용한다(P4 Task 1
// test/onboarding-sample.test.mjs 의 measure() 재사용 선례와 같은 원칙 — 생성/측정 로직과
// 시험이 각자 계산하면 두 곳이 갈린다). 문턱이 바뀌어 절이 늘 붙거나 아예 안 붙게 되면
// 여기서 걸린다 — 그때 문장 블록은 정보를 잃는다(늘 같은 문장 = 정보 0).
//
// 5%/80%/20% 는 이 시험이 스스로 세운 판단 기준(태스크 브리프 Step 3·4)이지 tools/
// measure-sentence-signals.mjs 안의 어떤 상수를 다시 계산해 비교하는 게 아니다 — measure()
// 는 backtest/earn-ohlc.json 실 데이터를 다시 읽어 독립적으로 계산한다.
//
// 2026-08-19 리뷰 Important B — measure() 는 2813창을 슬라이딩하며 analyzeX 를 7종 부른다
// (단독 실행 약 5초). 이 파일의 네 시험이 각자 measure() 를 부르면 20초가 든다 — 정확히
// test/onboarding-sample.test.mjs 상단 주석이 이미 겪고 고쳐 둔 문제("두 시험이 같은 후보
// 풀을 쓴다 — 매번 재계산하면 20여 초가 든다 ... 지연 계산 1회로 캐싱한다")와 같은 모양이라
// 그 패턴을 그대로 가져온다.
let _cache = null;
async function got() {
  if (_cache) return _cache;
  const { measure } = await import("../tools/measure-sentence-signals.mjs");
  _cache = measure();
  return _cache;
}

test("표본 풀은 30종목에서 최소 200창을 훑는다", async () => {
  const r = await got();
  assert.ok(r.total >= 200, "측정 창이 " + r.total + "개뿐이다 — 최소 200 필요(측정이 표본 부족으로 신뢰할 수 없다)");
  assert.strictEqual(r.symbols, 30,
    "표본 풀 종목 수가 " + r.symbols + "이다(기대 30) — backtest/earn-ohlc.json 이 바뀌었는지 확인할 것");
});

test("과열 절(볼린저 upper 또는 RSI 과매수, breakout_up 제외)이 극단 비율이 아니다 — 정보가 있다", async () => {
  const r = await got();
  const rate = r.overheat.rate;
  const toFloor = ((rate - 0.05) * 100).toFixed(1), toCeil = ((0.80 - rate) * 100).toFixed(1);
  assert.ok(rate > 0.05 && rate < 0.80,
    "과열 절 발생률이 극단이다 — " + (rate * 100).toFixed(1) + "% (" + r.overheat.count + "/" + r.total +
    ", 하한 5%까지 " + toFloor + "pp · 상한 80%까지 " + toCeil + "pp)");
});

test("저항 절(MA 근접, 엔진 sr 판정 재사용)이 극단 비율이 아니다 — 정보가 있다", async () => {
  const r = await got();
  const rate = r.resistance.rate;
  const toFloor = ((rate - 0.05) * 100).toFixed(1), toCeil = ((0.80 - rate) * 100).toFixed(1);
  assert.ok(rate > 0.05 && rate < 0.80,
    "저항 절 발생률이 극단이다 — " + (rate * 100).toFixed(1) + "% (" + r.resistance.count + "/" + r.total +
    ", 하한 5%까지 " + toFloor + "pp · 상한 80%까지 " + toCeil + "pp)");
});

test("과열·저항 절은 같은 것을 말하지 않는다 — 동시 발생률이 낮다", async () => {
  const r = await got();
  const rate = r.cooccurrence.rate;
  const margin = ((0.20 - rate) * 100).toFixed(1);
  assert.ok(rate < 0.20,
    "과열·저항 동시 발생률이 " + (rate * 100).toFixed(1) + "% 로 너무 높다(" + r.cooccurrence.count + "/" + r.total +
    ", 문턱 20%까지 " + margin + "pp) — 두 절이 항상 같이 붙으면 나눈 의미가 흐려진다");
});

// 2026-08-19 리뷰 Important A — breakout_up(%B>1, 종가가 상단밴드 위로 마감=밴드워킹)은
// 추세 지속 신호다. 판정 방향이 상승("상승 흐름입니다")일 때 그 위에 "다만 다소 과열된
// 구간입니다"를 붙이면 화면이 스스로와 모순된다. isOverheat 는 breakout_up "단독"(rsi 도
// upper 도 아닌 창)으로는 절대 켜지면 안 된다 — measure() 가 같은 루프 안에서 그 창들을
// 골라 이미 세어 뒀다(breakoutGuard, 창을 다시 빌드하지 않는다). isOverheat 가 다시
// breakout_up 을 조건에 끼워 넣으면(라운드 1로 회귀) 이 시험이 빨개진다 — 그때 이 저장소
// 108개 창 중 다수가 violations>0 으로 잡힌다(직접 확인: 라운드 1 정의로 되돌리면
// 108/108 위반).
test("밴드워킹(breakout_up) 단독 창은 과열로 판정되지 않는다 — 방향과 모순되는 문장 방지", async () => {
  const r = await got();
  const g = r.breakoutGuard;
  assert.ok(g.checked > 0, "breakout_up 단독 창이 표본에 하나도 없다 — 이 시험이 아무것도 못 잰다");
  assert.strictEqual(g.violations, 0,
    g.violations + "/" + g.checked + "개의 breakout_up 단독 창이 과열로 잘못 판정됐다 " +
    "(추세지속 신호에 과열 문구가 붙는다 — isOverheat 가 breakout_up 을 다시 조건에 넣었는지 확인할 것)");
});
