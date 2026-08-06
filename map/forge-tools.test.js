const test = require("node:test");
const assert = require("node:assert");
const T = require("./forge-tools.js");

const TIMES = ["2026-01-05","2026-01-06","2026-01-07","2026-01-08","2026-01-09"];

test("tToFi: 정확히 일치하는 날짜는 그 인덱스", () => {
  assert.strictEqual(T.tToFi(TIMES, "2026-01-05"), 0);
  assert.strictEqual(T.tToFi(TIMES, "2026-01-08"), 3);
});

test("tToFi: 두 봉 사이는 선형 보간(일봉 선을 주봉에서 볼 때)", () => {
  // 01-06 과 01-07 사이의 중간 지점
  const fi = T.tToFi(["2026-01-06","2026-01-08"], "2026-01-07");
  assert.ok(fi > 0 && fi < 1, "0과 1 사이여야: " + fi);
  assert.ok(Math.abs(fi - 0.5) < 0.001, "중간이어야: " + fi);
});

test("tToFi: 첫 봉 이전은 음수(창 밖 → 클립 대상)", () => {
  assert.ok(T.tToFi(TIMES, "2026-01-01") < 0);
});

test("tToFi: 마지막 봉 이후는 마지막 간격으로 외삽(예측 구간)", () => {
  const fi = T.tToFi(TIMES, "2026-01-11");   // 마지막(idx 4)에서 2일 뒤
  assert.ok(fi > 4, "4보다 커야: " + fi);
  assert.ok(Math.abs(fi - 6) < 0.001, "하루=1봉 간격이면 6: " + fi);
});

test("tToFi: 빈 배열·잘못된 입력은 NaN", () => {
  assert.ok(Number.isNaN(T.tToFi([], "2026-01-05")));
  assert.ok(Number.isNaN(T.tToFi(TIMES, "")));
});

test("fiToT: 봉 위치 → 날짜(반올림), 범위 밖은 양끝으로 클램프", () => {
  assert.strictEqual(T.fiToT(TIMES, 2), "2026-01-07");
  assert.strictEqual(T.fiToT(TIMES, 2.4), "2026-01-07");
  assert.strictEqual(T.fiToT(TIMES, -3), "2026-01-05");
  assert.strictEqual(T.fiToT(TIMES, 99), "2026-01-09");
});

test("segDist: 선분 위의 점은 0, 수직 거리, 끝점 너머는 끝점까지", () => {
  assert.ok(T.segDist(5, 0, 0, 0, 10, 0) < 1e-9);      // 선분 위
  assert.ok(Math.abs(T.segDist(5, 3, 0, 0, 10, 0) - 3) < 1e-9);   // 수직
  assert.ok(Math.abs(T.segDist(-4, 0, 0, 0, 10, 0) - 4) < 1e-9);  // 왼쪽 너머
  assert.ok(Math.abs(T.segDist(14, 0, 0, 0, 10, 0) - 4) < 1e-9);  // 오른쪽 너머
});

test("chanOff: 기준선에서 점까지의 수직 가격 차(부호 유지)", () => {
  const a = { fi: 0, p: 100 }, b = { fi: 10, p: 200 };   // 봉당 +10
  assert.ok(Math.abs(T.chanOff(a, b, { fi: 5, p: 150 })) < 1e-9);   // 선 위 = 0
  assert.ok(Math.abs(T.chanOff(a, b, { fi: 5, p: 170 }) - 20) < 1e-9);
  assert.ok(Math.abs(T.chanOff(a, b, { fi: 5, p: 130 }) + 20) < 1e-9);
});

test("undo 스택: 빈 스택은 null", () => {
  const T2 = require("./forge-tools.js");
  T2._undoReset();
  assert.strictEqual(T2._undoPop(), null, "빈 스택은 null");
});

test("undo 스택: push/pop 왕복 — 저장된 상태를 그대로 복원", () => {
  const T2 = require("./forge-tools.js");
  const original = [
    { id: "d_001", type: "trend", a: { t: "2026-01-05", p: 100 }, b: { t: "2026-01-06", p: 110 } }
  ];
  T2.drawsLoad(original);
  T2._undoReset();
  T2._undoPush();

  // 라이브 상태 변경 — T5 부터 drawsLoad 는 호출마다 되돌리기 스택도 비운다(문서 전환 가드,
  // 아래 "drawsLoad 는 스택을 비운다" 테스트 참고). 여기선 순수히 push/pop 왕복만 보고 싶으므로
  // drawsLoad 대신 drawsAll()이 돌려주는 라이브 배열을 직접 뮤테이트해 스택을 건드리지 않는다.
  const live = T2.drawsAll();
  live.length = 0;
  live.push({ id: "d_002", type: "channel", a: { t: "2026-01-07", p: 120 }, b: { t: "2026-01-08", p: 130 } });

  // pop 하면 원래 상태가 나와야 함
  const restored = T2._undoPop();
  assert.strictEqual(restored.length, 1);
  assert.strictEqual(restored[0].id, "d_001");
  assert.strictEqual(restored[0].type, "trend");
  assert.strictEqual(restored[0].a.p, 100);
});

test("undo 스택: 스냅샷 격리 — 복원된 상태가 라이브 상태와 독립", () => {
  const T2 = require("./forge-tools.js");
  const original = [{ id: "d_001", type: "trend", a: { t: "2026-01-05", p: 100 }, b: { t: "2026-01-06", p: 110 } }];
  T2.drawsLoad(original);
  T2._undoReset();
  T2._undoPush();

  // 복원된 상태를 뮤테이트
  const restored = T2._undoPop();
  restored[0].a.p = 999;

  // 라이브 상태가 변하지 않았는지 확인
  const live = T2.drawsAll();
  assert.strictEqual(live[0].a.p, 100, "라이브 상태는 독립적이어야 함");
});

test("undo 스택: 최대 30개 제한 — 31개 push 시 첫 번째가 삭제됨", () => {
  const T2 = require("./forge-tools.js");
  T2.drawsLoad([]);
  T2._undoReset();

  // 31개 push — drawsLoad 는 호출마다 스택을 비우므로(T5) 여기서도 drawsAll() 로 얻은 라이브
  // 배열을 직접 뮤테이트해 상태를 바꾼다(스택은 그대로 유지돼야 이 테스트가 성립함).
  const live = T2.drawsAll();
  for (let i = 0; i < 31; i++) {
    live.length = 0;
    live.push({ id: `d_${String(i).padStart(3, "0")}`, type: "trend", a: { t: "2026-01-05", p: 100 + i }, b: { t: "2026-01-06", p: 110 + i } });
    T2._undoPush();
  }

  // 정확히 30개만 pop 가능
  let count = 0;
  let oldestRemaining = null;
  let popped;
  while ((popped = T2._undoPop()) !== null) {
    oldestRemaining = popped;  // 마지막 pop이 가장 오래된 남은 것
    count++;
  }
  assert.strictEqual(count, 30, "정확히 30개만 pop 가능해야 함");
  assert.strictEqual(oldestRemaining[0].id, "d_001", "가장 오래된 유지된 스냅샷은 d_001이어야 함 (d_000이 삭제됨)");
});

test("drawStyle: color·w 가 없으면 도구 기본색과 CW.base", () => {
  const T2 = require("./forge-tools.js");
  const s = T2.drawStyle({ type: "trend" });
  assert.strictEqual(typeof s.color, "string");
  assert.ok(s.color.length >= 4, "기본색이 있어야: " + s.color);
  assert.ok(Math.abs(s.w - 1.25) < 1e-9, "기본 굵기는 CW.base(1.25): " + s.w);
});

test("drawStyle: 저장된 color·w 를 그대로 쓴다", () => {
  const T2 = require("./forge-tools.js");
  const s = T2.drawStyle({ type: "trend", color: "#46c28e", w: "bold" });
  assert.strictEqual(s.color, "#46c28e");
  assert.ok(Math.abs(s.w - 1.6) < 1e-9, "bold 는 1.6: " + s.w);
});

test("drawStyle: 알 수 없는 w 는 base 로 떨어진다", () => {
  const T2 = require("./forge-tools.js");
  assert.ok(Math.abs(T2.drawStyle({ type: "trend", w: "zzz" }).w - 1.25) < 1e-9);
});

test("스와치 상수: 색 5종·굵기 3단", () => {
  const T2 = require("./forge-tools.js");
  assert.strictEqual(T2.SW_COLORS.length, 5);
  assert.deepStrictEqual(T2.SW_W, ["thin", "base", "bold"]);
});

/* ── 수평선·수직선 회귀 테스트 (F1·F2 리뷰 대응) ──────────────────────
   drawsPointerDown/_delBadge 는 document·priceTimes 를 참조하므로 최소 DOM/geo 셰임을
   구성해 실제 좌표계를 통과시킨다("추측 좌표"가 아니라 drawsGeo() 와 같은 공식으로 계산). */
function withChartShim(fn) {
  const g = { padX: 50, padTop: 20, padBot: 30, ch: 400, histW: 600, plotRight: 650, start: 0, count: 100, log: false, loV: 50, hiV: 150 };
  const times = [];
  { const base = Date.parse("2026-01-01T00:00:00Z"); for (let i = 0; i < 150; i++) times.push(new Date(base + i * 86400000).toISOString().slice(0, 10)); }
  function makeCtx() {
    const t = {};
    return new Proxy(t, {
      get(o, p) { if (p in o) return o[p]; if (p === "measureText") return s => ({ width: String(s || "").length * 7 }); return function () {}; },
      set(o, p, v) { o[p] = v; return true; }
    });
  }
  function makeCanvas(extra) { return Object.assign({ style: {}, width: 0, height: 0, parentElement: { clientWidth: 800, clientHeight: 450 }, getContext: () => makeCtx() }, extra || {}); }
  const mainCanvas = makeCanvas({ _mainGeo: g }), drawsCanvas = makeCanvas({});
  const prevDoc = global.document, prevWin = global.window, prevPT = global.priceTimes;
  global.window = { devicePixelRatio: 1 };
  global.document = {
    getElementById(id) { if (id === "fcMainChart") return mainCanvas; if (id === "fcDraws") return drawsCanvas; return null; },
    querySelectorAll() { return []; }, addEventListener() {}, activeElement: null,
  };
  global.priceTimes = () => times;
  try { fn({ g, times }); }
  finally { global.document = prevDoc; global.window = prevWin; global.priceTimes = prevPT; }
}

test("F1 회귀: hline 1클릭 생성 — 그림 1개·b 없음·undo 스냅샷엔 안 들어있음", () => {
  const T2 = require("./forge-tools.js");
  withChartShim(({ g }) => {
    T2.drawsLoad([]);
    T2._undoReset();
    T2.drawsArm("hline");
    const G = T2.drawsGeo();
    const cy = G.pToY(90);   // 임의의 가격 위치
    const r = T2.drawsPointerDown({}, 300, cy);
    assert.strictEqual(r, true, "1클릭이 소비되어야 함");
    const all = T2.drawsAll();
    assert.strictEqual(all.length, 1, "그림이 정확히 1개 생성돼야 함");
    assert.ok(!("b" in all[0]), "hline 은 b 프로퍼티가 없어야 함");
    // F1: _undoPush() 는 이 선을 DRAWS 에 넣기 '전' 상태를 스냅샷해야 한다 — pop 했을 때
    // 빈 배열이 나와야 정상(되돌리면 방금 그은 선이 사라짐). 순서가 뒤집히면 스냅샷 안에
    // 이미 이 선이 들어있어 되돌리기가 무효과가 된다.
    const popped = T2._undoPop();
    assert.ok(Array.isArray(popped), "스냅샷이 존재해야 함");
    assert.strictEqual(popped.length, 0, "스냅샷은 선을 긋기 전(빈 배열)이어야 함 — undo 가 유효해야 함");
  });
  T2.drawsLoad([]); T2._undoReset();   // 다음 테스트를 위한 상태 정리(모듈이 require 캐시로 공유됨)
});

test("F1 회귀: vline 1클릭 생성 — 그림 1개·b 없음·undo 스냅샷엔 안 들어있음", () => {
  const T2 = require("./forge-tools.js");
  withChartShim(({ g }) => {
    T2.drawsLoad([]);
    T2._undoReset();
    T2.drawsArm("vline");
    const G = T2.drawsGeo();
    const cx = G.fiToX(40);
    const r = T2.drawsPointerDown({}, cx, 200);
    assert.strictEqual(r, true, "1클릭이 소비되어야 함");
    const all = T2.drawsAll();
    assert.strictEqual(all.length, 1, "그림이 정확히 1개 생성돼야 함");
    assert.ok(!("b" in all[0]), "vline 은 b 프로퍼티가 없어야 함");
    const popped = T2._undoPop();
    assert.ok(Array.isArray(popped), "스냅샷이 존재해야 함");
    assert.strictEqual(popped.length, 0, "스냅샷은 선을 긋기 전(빈 배열)이어야 함 — undo 가 유효해야 함");
  });
  T2.drawsLoad([]); T2._undoReset();
});

test("F2 회귀: 그림이 없고 도구도 무장 안 됐으면 drawsPointerDown 은 false (회귀 없음)", () => {
  const T2 = require("./forge-tools.js");
  withChartShim(() => {
    T2.drawsLoad([]);
    const r = T2.drawsPointerDown({}, 300, 200);
    assert.strictEqual(r, false, "그림도 없고 무장도 안 됐으면 false 여야 팬/줌이 안 막힘");
  });
});

test("F2 회귀: 상단 끝에 붙은 hline 의 ✕ 배지 중심이 클립 사각형 안에 클램프됨", () => {
  const T2 = require("./forge-tools.js");
  withChartShim(({ g }) => {
    const DEL_R = 9;   // forge-tools.js 내부 상수와 동일(비노출) — 경계 계산용으로 동일 값을 둔다
    T2.drawsLoad([{ id: "h1", type: "hline", a: { t: "2026-01-10", p: 149 } }]);   // 가시범위 최상단 근처 가격
    const G = T2.drawsGeo();
    const badge = T2._delBadge(G, T2.drawsAll()[0]);
    assert.ok(badge, "배지 좌표가 계산돼야 함");
    assert.ok(badge.y >= G.g.padTop + DEL_R + 2 - 1e-6, "배지 중심이 클립 상단 안쪽이어야 함(회귀 전엔 위로 튀어나감): " + badge.y);
    assert.ok(badge.y <= G.g.ch - G.g.padBot - DEL_R - 2 + 1e-6, "배지 중심이 클립 하단 안쪽이어야 함: " + badge.y);
    assert.ok(badge.x >= G.g.padX - 2 - 1e-6 && badge.x <= G.g.plotRight - DEL_R - 2 + 1e-6, "배지 중심이 가로로도 클립 안쪽이어야 함: " + badge.x);
  });
});

test("F2 회귀: 마지막 봉에 찍힌 vline 의 ✕ 배지 중심이 클립 사각형 안에 클램프됨", () => {
  const T2 = require("./forge-tools.js");
  withChartShim(({ g, times }) => {
    const DEL_R = 9;
    T2.drawsLoad([{ id: "v1", type: "vline", a: { t: times[99], p: 100 } }]);   // 가시범위 마지막 봉("오늘 표시" 같은 자연스러운 사용)
    const G = T2.drawsGeo();
    const badge = T2._delBadge(G, T2.drawsAll()[0]);
    assert.ok(badge, "배지 좌표가 계산돼야 함");
    assert.ok(badge.x >= G.g.padX - 2 - 1e-6 && badge.x <= G.g.plotRight - DEL_R - 2 + 1e-6, "배지 중심이 클립 우측 안쪽이어야 함(회귀 전엔 오른쪽으로 튀어나감): " + badge.x);
    assert.ok(badge.y >= G.g.padTop + DEL_R + 2 - 1e-6 && badge.y <= G.g.ch - G.g.padBot - DEL_R - 2 + 1e-6, "배지 중심이 세로로도 클립 안쪽이어야 함: " + badge.y);
  });
});

/* ── 스와치(색·굵기) 회귀 테스트 (Task 4) ──────────────────────────── */

test("스와치: 색 스와치 클릭 → d.color 저장 + drawStyle 이 새 색 반영", () => {
  const T2 = require("./forge-tools.js");
  withChartShim(({ g }) => {
    T2.drawsLoad([{ id: "h1", type: "hline", a: { t: "2026-01-10", p: 100 } }]);
    T2._undoReset();
    const G = T2.drawsGeo();
    const y = G.pToY(100);
    assert.strictEqual(T2.drawsPointerDown({}, 300, y), true, "본체 클릭으로 선택돼야 함");
    const d = T2.drawsAll()[0];
    const rects = T2._swatchRects(G, d);
    const before = T2.drawStyle(d).color;
    const target = rects.find(r => r.kind === "color" && r.val !== before);
    assert.ok(target, "기본색과 다른 색 스와치가 있어야 함");
    const cx = target.x + target.w / 2, cy = target.y + target.h / 2;
    assert.strictEqual(T2.drawsPointerDown({}, cx, cy), true, "스와치 클릭이 소비되어야 함");
    assert.strictEqual(T2.drawsAll()[0].color, target.val, "d.color 에 저장돼야 함");
    assert.strictEqual(T2.drawStyle(T2.drawsAll()[0]).color, target.val, "drawStyle 이 새 색을 반영해야 함");
  });
  T2.drawsLoad([]); T2._undoReset();
});

test("스와치: 굵기 스와치 클릭 → d.w 저장 + drawStyle 이 CW 숫자 반영", () => {
  const T2 = require("./forge-tools.js");
  withChartShim(({ g }) => {
    T2.drawsLoad([{ id: "h1", type: "hline", a: { t: "2026-01-10", p: 100 } }]);
    T2._undoReset();
    const G = T2.drawsGeo();
    const y = G.pToY(100);
    T2.drawsPointerDown({}, 300, y);   // 본체 클릭으로 선택
    const d = T2.drawsAll()[0];
    const rects = T2._swatchRects(G, d);
    const target = rects.find(r => r.kind === "w" && r.val === "bold");
    assert.ok(target, "bold 스와치가 있어야 함");
    const cx = target.x + target.w / 2, cy = target.y + target.h / 2;
    assert.strictEqual(T2.drawsPointerDown({}, cx, cy), true, "스와치 클릭이 소비되어야 함");
    assert.strictEqual(T2.drawsAll()[0].w, "bold", "d.w 에 저장돼야 함(문자열 키)");
    assert.ok(Math.abs(T2.drawStyle(T2.drawsAll()[0]).w - 1.6) < 1e-9, "drawStyle.w 가 CW.bold(1.6) 이어야 함: " + T2.drawStyle(T2.drawsAll()[0]).w);
  });
  T2.drawsLoad([]); T2._undoReset();
});

test("스와치: undo 스냅샷은 뮤테이트 '전' 상태 — push-before-mutate 계약 가드", () => {
  const T2 = require("./forge-tools.js");
  withChartShim(({ g }) => {
    T2.drawsLoad([{ id: "h1", type: "hline", a: { t: "2026-01-10", p: 100 } }]);
    T2._undoReset();
    const G = T2.drawsGeo();
    const y = G.pToY(100);
    T2.drawsPointerDown({}, 300, y);   // 선택
    const d = T2.drawsAll()[0];
    const rects = T2._swatchRects(G, d);
    // Minor(리뷰) 반영: 이미 적용된 색과 같은 스와치를 누르면 이제 no-op(undo 도 안 쌓임) —
    // 이 테스트는 "실제로 바뀌는" 클릭의 undo 계약을 보고 싶은 것이므로 현재 색과 다른
    // 스와치를 골라야 한다(현재 색과 같은 걸 고르면 뮤테이트 자체가 안 일어나 오검출됨).
    const before = T2.drawStyle(d).color;
    const target = rects.find(r => r.kind === "color" && r.val !== before);
    assert.ok(target, "기본색과 다른 색 스와치가 있어야 함");
    const cx = target.x + target.w / 2, cy = target.y + target.h / 2;
    T2.drawsPointerDown({}, cx, cy);   // 스와치 클릭 = _undoPush() 후 뮤테이트(계약)
    assert.strictEqual(T2.drawsAll()[0].color, target.val, "라이브 상태엔 새 색이 반영돼 있어야 함");
    const popped = T2._undoPop();
    assert.ok(Array.isArray(popped) && popped.length === 1, "스냅샷이 존재해야 함");
    // F1 계약: push 는 뮤테이트 전 상태를 캡처해야 하므로, 스냅샷 속 color 는 아직
    // 새 값이 아니어야 한다(과거엔 이 순서가 뒤집혀 undo 가 무효과였다).
    assert.notStrictEqual(popped[0].color, target.val, "스냅샷엔 새 색이 아직 없어야 함(뮤테이트 전 캡처)");
  });
  T2.drawsLoad([]); T2._undoReset();
});

test("스와치: 상단 끝 hline 에서도 스와치 줄 8칸 전부가 클립 사각형 안에 있음", () => {
  const T2 = require("./forge-tools.js");
  withChartShim(({ g }) => {
    T2.drawsLoad([{ id: "h1", type: "hline", a: { t: "2026-01-10", p: 149 } }]);   // 가시범위 최상단 근처 가격
    const G = T2.drawsGeo();
    const rects = T2._swatchRects(G, T2.drawsAll()[0]);
    assert.strictEqual(rects.length, 8, "색 5 + 굵기 3 = 8칸이어야 함");
    // F3(재검토): 이 픽스처는 배지가 상단에 붙어 아래로 자리가 넉넉하므로 y0 는 "아래"
    // 분기만 타고 클립 하단 클램프엔 애초에 안 닿는다(그 시나리오는 아래 "하단 pinned"
    // 테스트가 전담) — 여기선 좌·상·우 3면 클립 포함만 확인한다(이전엔 "회귀 전엔 아래로
    // 튀어나감"이라 잘못 서술돼 있었다 — 이 픽스처가 구조적으로 재현 못 하는 시나리오).
    for (const r of rects) {
      assert.ok(r.x >= G.g.padX - 2 - 1e-6, "좌측 클립 안쪽이어야 함: " + r.x);
      assert.ok(r.x + r.w <= G.g.plotRight + 2 + 1e-6, "우측 클립 안쪽이어야 함: " + (r.x + r.w));
      assert.ok(r.y >= G.g.padTop - 1e-6, "상단 클립 안쪽이어야 함: " + r.y);
      assert.ok(r.y + r.h <= G.g.ch - G.g.padBot + 1e-6, "하단 클립 안쪽이어야 함: " + (r.y + r.h));
    }
  });
});

test("스와치: 마지막 봉 vline(우측 가장자리)에서도 스와치 줄이 클립 사각형 안에 있음", () => {
  const T2 = require("./forge-tools.js");
  withChartShim(({ g, times }) => {
    T2.drawsLoad([{ id: "v1", type: "vline", a: { t: times[99], p: 100 } }]);
    const G = T2.drawsGeo();
    const rects = T2._swatchRects(G, T2.drawsAll()[0]);
    for (const r of rects) {
      assert.ok(r.x >= G.g.padX - 2 - 1e-6, "좌측 클립 안쪽이어야 함: " + r.x);
      assert.ok(r.x + r.w <= G.g.plotRight + 2 + 1e-6, "우측 클립 안쪽이어야 함(회귀 전엔 오른쪽으로 튀어나감): " + (r.x + r.w));
      assert.ok(r.y >= G.g.padTop - 1e-6, "상단 클립 안쪽이어야 함: " + r.y);
      assert.ok(r.y + r.h <= G.g.ch - G.g.padBot + 1e-6, "하단 클립 안쪽이어야 함: " + (r.y + r.h));
    }
  });
});

test("F1(치명적) 회귀: 하단 pinned 도형 — 스와치 줄이 ✕ 배지 히트원과 절대 겹치지 않음(파괴적 오클릭 가드)", () => {
  const T2 = require("./forge-tools.js");
  withChartShim(({ g }) => {
    // 리뷰어 재현 그대로: 가시범위 최하단(loV=50) 가격에 hline — _delBadge 가 배지를
    // 자기 자신의 클립 하단 한계(ch-padBot-DEL_R-2)로 클램프하는 바로 그 시나리오.
    T2.drawsLoad([{ id: "h1", type: "hline", a: { t: "2026-01-10", p: 50 } }]);
    T2._undoReset();
    const G = T2.drawsGeo();
    T2.drawsPointerDown({}, 300, G.pToY(50));   // 본체 클릭으로 선택(스와치/핸들 판정엔 _selId 필요)
    const d = T2.drawsAll()[0];
    const db = T2._delBadge(G, d);
    assert.ok(db, "배지 좌표가 계산돼야 함");

    // (a) 이 픽스처가 실제로 "아래에 자리 없음" 분기를 강제하는지 먼저 확인한다 —
    //     아니면 이 테스트가 문제의 그 경로를 안 타는 셈이라 가드로서 무의미하다.
    const SEP = db.r + 6, S = 12;
    const naiveBelow = db.y + SEP;
    assert.ok(naiveBelow + S > G.g.ch - G.g.padBot,
      "이 픽스처는 '아래에 자리 없음' 분기를 강제해야 함(안 그러면 재현이 아님): naiveBelow=" + naiveBelow);
    const rects = T2._swatchRects(G, d);
    // 모든 스와치가 y0 를 공유 — 순진한 아래 배치(db.y+SEP)가 아니라 위로 뒤집혔는지
    // 직접 확인한다(클램프/뒤집기가 실제로 발동했다는 증거, 우연한 안전 거리가 아님).
    assert.ok(rects[0].y < db.y,
      "자리가 없으면 스와치 줄이 배지 위로 뒤집혀야 함: y0=" + rects[0].y + " db.y=" + db.y);

    // (b) F1 가드 본체 — 어떤 스와치 칸도 ✕ 배지 히트원(반경 db.r+2)과 겹치면 안 된다는
    //     불변식을 모든 칸에 대해 직접 검증한다(사각형→원 최근접점 거리).
    for (const r of rects) {
      const nx = Math.max(r.x, Math.min(db.x, r.x + r.w));
      const ny = Math.max(r.y, Math.min(db.y, r.y + r.h));
      const dist = Math.hypot(nx - db.x, ny - db.y);
      assert.ok(dist > db.r + 2,
        "스와치 칸이 ✕ 배지 히트원과 겹치면 안 됨(누르면 도형이 삭제됨): kind=" + r.kind + " val=" + r.val +
        " 거리=" + dist.toFixed(2) + " 배지반경+2=" + (db.r + 2));
    }

    // 실사용 클릭 시나리오로 다시 확인: 첫 칸(leftmost color) 중앙을 누르면 "swatch" 여야지
    // "del" 로 오판정되면(회귀 전 증상) 도형이 조용히 삭제된다.
    const hit = T2.drawsHitTest(rects[0].x + rects[0].w / 2, rects[0].y + rects[0].h / 2);
    assert.strictEqual(hit && hit.kind, "swatch",
      "첫 스와치 칸 클릭은 'swatch' 여야 함(회귀 전엔 'del' 로 오판정돼 도형이 삭제됐다)");
  });
  T2.drawsLoad([]); T2._undoReset();
});

/* ── Ctrl+Z 되돌리기 회귀 테스트 (Task 5) ──────────────────────────── */

test("undo: 두 앵커 그리기(trend) 완성 후 Ctrl+Z 하면 그 그림이 사라짐", () => {
  const T2 = require("./forge-tools.js");
  withChartShim(() => {
    T2.drawsLoad([]);
    T2._undoReset();
    T2.drawsArm("trend");
    const G = T2.drawsGeo();
    const y1 = G.pToY(90), y2 = G.pToY(110);
    assert.strictEqual(T2.drawsPointerDown({}, 200, y1), true, "1번째 클릭(시작점)이 소비되어야 함");
    T2.drawsPointerUp();   // 클릭식 그리기 — stage2(끝점 대기)로 전환
    assert.strictEqual(T2.drawsPointerDown({}, 400, y2), true, "2번째 클릭(끝점)이 소비되어야 함");
    T2.drawsPointerUp();
    assert.strictEqual(T2.drawsAll().length, 1, "trend 그림 1개가 완성돼야 함");
    const consumed = T2.drawsKey({ ctrlKey: true, key: "z" });
    assert.strictEqual(consumed, true, "Ctrl+Z 는 이벤트를 삼켜야 함");
    assert.strictEqual(T2.drawsAll().length, 0, "되돌리면 방금 그은 trend 가 사라져야 함(생성 전 상태로 복원)");
  });
  T2.drawsLoad([]); T2._undoReset();
});

test("undo: Delete 키로 지운 그림이 Ctrl+Z 로 복원됨", () => {
  const T2 = require("./forge-tools.js");
  withChartShim(() => {
    T2.drawsLoad([{ id: "h1", type: "hline", a: { t: "2026-01-10", p: 100 } }]);
    T2._undoReset();
    const G = T2.drawsGeo();
    T2.drawsPointerDown({}, 300, G.pToY(100));   // 본체 클릭으로 선택
    assert.strictEqual(T2.drawsAll().length, 1);
    // 본체 클릭 자체도 드래그 시작 지점 push(핸들/이동 가드)를 남기므로, Delete 브랜치의
    // push 만 단독으로 검증하려면 선택 직후의 그 스냅샷을 지워야 한다(안 지우면 Delete
    // 브랜치 push 를 제거해도 이 스냅샷이 대신 복원해줘 mutation 이 안 걸린다).
    T2._undoReset();
    const consumedDel = T2.drawsKey({ key: "Delete" });
    assert.strictEqual(consumedDel, true, "Delete 가 소비되어야 함");
    assert.strictEqual(T2.drawsAll().length, 0, "Delete 로 지워져야 함");
    const consumedUndo = T2.drawsKey({ ctrlKey: true, key: "z" });
    assert.strictEqual(consumedUndo, true, "Ctrl+Z 는 이벤트를 삼켜야 함");
    assert.strictEqual(T2.drawsAll().length, 1, "Ctrl+Z 로 복원돼야 함");
    assert.strictEqual(T2.drawsAll()[0].id, "h1", "같은 그림이 복원돼야 함");
  });
  T2.drawsLoad([]); T2._undoReset();
});

test("undo: 통째 이동(move) 드래그 — 원래 앵커로 복원 + 드래그 1회는 되돌리기 1단계만 남김", () => {
  const T2 = require("./forge-tools.js");
  withChartShim(() => {
    T2.drawsLoad([{ id: "t1", type: "trend", a: { t: "2026-01-10", p: 100 }, b: { t: "2026-01-20", p: 110 } }]);
    T2._undoReset();
    const G = T2.drawsGeo();
    const fiA = T2.tToFi(G.times, "2026-01-10"), fiB = T2.tToFi(G.times, "2026-01-20");
    const Ax = G.fiToX(fiA), Ay = G.pToY(100), Bx = G.fiToX(fiB), By = G.pToY(110);
    const midx = (Ax + Bx) / 2, midy = (Ay + By) / 2;
    assert.strictEqual(T2.drawsPointerDown({}, midx, midy), true, "본체 클릭으로 선택 + move 드래그 시작");
    // 드래그 중 여러 번 이동 — push 는 pointerdown 시점 1회만 나야 한다(각 move 마다 나면 안 됨).
    T2.drawsPointerMove({}, midx + 30, midy - 10);
    T2.drawsPointerMove({}, midx + 55, midy - 22);
    T2.drawsPointerMove({}, midx + 70, midy - 30);
    T2.drawsPointerUp();
    const moved = T2.drawsAll()[0];
    assert.notStrictEqual(moved.a.p, 100, "드래그 후 앵커 가격이 바뀌어야 함(그래야 복원 검증에 의미가 있음): " + moved.a.p);

    const consumed = T2.drawsKey({ ctrlKey: true, key: "z" });
    assert.strictEqual(consumed, true, "Ctrl+Z 는 이벤트를 삼켜야 함");
    const restored = T2.drawsAll()[0];
    assert.strictEqual(restored.a.p, 100, "원래 시작 앵커 가격으로 복원돼야 함");
    assert.strictEqual(restored.b.p, 110, "원래 끝 앵커 가격으로 복원돼야 함");
    assert.strictEqual(restored.a.t, "2026-01-10");
    assert.strictEqual(restored.b.t, "2026-01-20");

    // 드래그 한 번(여러 pointermove 포함) = 되돌리기 스택엔 정확히 1단계만 쌓였어야 한다 —
    // 방금 그 1단계를 이미 소비했으니 이제 스택은 비어 있어야 함.
    assert.strictEqual(T2._undoPop(), null, "드래그 1회는 되돌리기 스택에 정확히 1단계만 남겨야 함(과도 push 없음)");
  });
  T2.drawsLoad([]); T2._undoReset();
});

test("undo: 끝점(handle) 드래그 — Ctrl+Z 로 그 끝점만 원래 자리로 복원", () => {
  const T2 = require("./forge-tools.js");
  withChartShim(() => {
    T2.drawsLoad([{ id: "t2", type: "trend", a: { t: "2026-01-10", p: 100 }, b: { t: "2026-01-20", p: 110 } }]);
    T2._undoReset();
    const G = T2.drawsGeo();
    const fiA = T2.tToFi(G.times, "2026-01-10"), fiB = T2.tToFi(G.times, "2026-01-20");
    const Ax = G.fiToX(fiA), Ay = G.pToY(100), Bx = G.fiToX(fiB), By = G.pToY(110);
    const midx = (Ax + Bx) / 2, midy = (Ay + By) / 2;
    // 핸들은 선택된 그림에만 판정되므로, 먼저 본체를 클릭해 선택한다(이 클릭 자체는 무의미한
    // move-드래그 스냅샷을 하나 남기므로 undoReset 으로 지워 이번 테스트 대상에서 제외한다).
    T2.drawsPointerDown({}, midx, midy);
    T2.drawsPointerUp();
    T2._undoReset();

    const consumed = T2.drawsPointerDown({}, Ax, Ay);   // A 핸들 위 클릭
    assert.strictEqual(consumed, true, "핸들 클릭이 소비되어야 함");
    T2.drawsPointerMove({}, Ax + 25, Ay + 40);
    T2.drawsPointerUp();
    const moved = T2.drawsAll()[0];
    assert.notStrictEqual(moved.a.p, 100, "핸들 드래그 후 a 가 바뀌어야 함: " + moved.a.p);
    assert.strictEqual(moved.b.p, 110, "핸들 드래그는 반대쪽 b 에 영향이 없어야 함(대조군)");

    const k = T2.drawsKey({ ctrlKey: true, key: "z" });
    assert.strictEqual(k, true, "Ctrl+Z 는 이벤트를 삼켜야 함");
    const restored = T2.drawsAll()[0];
    assert.strictEqual(restored.a.p, 100, "a 가 원래 가격으로 복원돼야 함");
    assert.strictEqual(restored.a.t, "2026-01-10", "a 가 원래 날짜로 복원돼야 함");
  });
  T2.drawsLoad([]); T2._undoReset();
});

test("undo: 전체 지우기(drawsClear) 후 Ctrl+Z 로 모든 그림이 복원됨", () => {
  const T2 = require("./forge-tools.js");
  withChartShim(() => {
    T2.drawsLoad([
      { id: "a1", type: "hline", a: { t: "2026-01-10", p: 100 } },
      { id: "a2", type: "vline", a: { t: "2026-01-15", p: 0 } },
    ]);
    T2._undoReset();
    T2.drawsClear();
    assert.strictEqual(T2.drawsAll().length, 0, "전체 지우기 직후엔 비어 있어야 함");
    const consumed = T2.drawsKey({ ctrlKey: true, key: "z" });
    assert.strictEqual(consumed, true, "Ctrl+Z 는 이벤트를 삼켜야 함");
    const restored = T2.drawsAll();
    assert.strictEqual(restored.length, 2, "지운 그림 2개가 모두 복원돼야 함");
    assert.deepStrictEqual(restored.map(d => d.id).sort(), ["a1", "a2"]);
  });
  T2.drawsLoad([]); T2._undoReset();
});

test("undo: drawsLoad(문서 전환)는 되돌리기 스택을 비운다 — 다른 종목 그림을 되살릴 수 없음", () => {
  const T2 = require("./forge-tools.js");
  withChartShim(() => {
    T2.drawsLoad([{ id: "sym1_1", type: "hline", a: { t: "2026-01-10", p: 100 } }]);
    T2._undoReset();
    T2.drawsClear();   // sym1 상태 스냅샷 1개가 push 됨
    T2.drawsLoad([{ id: "sym2_1", type: "hline", a: { t: "2026-02-01", p: 200 } }]);   // 다른 종목 문서로 전환
    const consumed = T2.drawsKey({ ctrlKey: true, key: "z" });
    assert.strictEqual(consumed, true, "스택이 비어도 이벤트는 삼켜야 함(브라우저 기본 동작 방지)");
    const live = T2.drawsAll();
    assert.strictEqual(live.length, 1, "sym2 문서 그대로여야 함(sym1 그림이 되살아나면 안 됨)");
    assert.strictEqual(live[0].id, "sym2_1", "sym1 그림이 섞여 들어오면 안 됨");
  });
  T2.drawsLoad([]); T2._undoReset();
});

test("undo: 입력 필드에 포커스 중이면 drawsKey 가 Ctrl+Z 를 가로채지 않음(false)", () => {
  const T2 = require("./forge-tools.js");
  const prevDoc = global.document;
  global.document = { activeElement: { tagName: "INPUT", isContentEditable: false } };
  try {
    const r = T2.drawsKey({ ctrlKey: true, key: "z" });
    assert.strictEqual(r, false, "input 포커스 중엔 브라우저 기본 실행취소를 뺏으면 안 됨(브라우저 자체 undo 유지)");
  } finally {
    global.document = prevDoc;
  }
});

/* ── F1/F2 리뷰 대응 회귀 테스트 (Task 5 재검토) ─────────────────────── */

test("undo: ✕ 배지 클릭 삭제 후 Ctrl+Z 로 복원됨", () => {
  const T2 = require("./forge-tools.js");
  withChartShim(() => {
    T2.drawsLoad([{ id: "h1", type: "hline", a: { t: "2026-01-10", p: 100 } }]);
    T2._undoReset();
    const G = T2.drawsGeo();
    // ✕ 배지는 선택된 그림에만 뜬다 — 먼저 본체 클릭으로 선택한다. 이 선택 클릭 자체가
    // 남기는 스냅샷은 이번 테스트 대상이 아니므로(F2 수정 후엔 이동 없는 클릭이라 pointerUp
    // 에서 자동으로 버려지지만, 방어적으로 명시) undoReset 으로 한 번 더 지운다.
    T2.drawsPointerDown({}, 300, G.pToY(100));
    T2.drawsPointerUp();
    T2._undoReset();
    const d = T2.drawsAll()[0];
    const badge = T2._delBadge(G, d);
    assert.ok(badge, "배지 좌표가 계산돼야 함(off-target 이면 drawsHitTest 가 null 을 내 오검출됨)");
    const consumedDel = T2.drawsPointerDown({}, badge.x, badge.y);
    assert.strictEqual(consumedDel, true, "✕ 배지 클릭이 소비되어야 함");
    assert.strictEqual(T2.drawsAll().length, 0, "✕ 배지 클릭으로 지워져야 함");
    const consumedUndo = T2.drawsKey({ ctrlKey: true, key: "z" });
    assert.strictEqual(consumedUndo, true, "Ctrl+Z 는 이벤트를 삼켜야 함");
    assert.strictEqual(T2.drawsAll().length, 1, "Ctrl+Z 로 복원돼야 함");
    assert.strictEqual(T2.drawsAll()[0].id, "h1", "같은 그림이 복원돼야 함");
  });
  T2.drawsLoad([]); T2._undoReset();
});

test("undo: 선택만 하고(이동 없이) 놓으면 되돌리기 스택에 아무것도 안 남음(낭비 스냅샷 가드)", () => {
  const T2 = require("./forge-tools.js");
  withChartShim(() => {
    T2.drawsLoad([{ id: "t3", type: "trend", a: { t: "2026-01-10", p: 100 }, b: { t: "2026-01-20", p: 110 } }]);
    T2._undoReset();
    const G = T2.drawsGeo();
    const fiA = T2.tToFi(G.times, "2026-01-10"), fiB = T2.tToFi(G.times, "2026-01-20");
    const Ax = G.fiToX(fiA), Ay = G.pToY(100), Bx = G.fiToX(fiB), By = G.pToY(110);
    const midx = (Ax + Bx) / 2, midy = (Ay + By) / 2;

    assert.strictEqual(T2.drawsPointerDown({}, midx, midy), true, "본체 클릭으로 선택(=move 드래그 시작)");
    T2.drawsPointerUp();   // 움직이지 않고 바로 뗀다 — 아무 것도 안 바뀌어야 함

    assert.strictEqual(T2.drawsAll()[0].a.p, 100, "실제로 아무 것도 안 바뀌었어야 함(대조군)");
    // pop 해서 뭔가 나오면 낭비 스냅샷이 남은 것 — 나오면 안 됨.
    assert.strictEqual(T2._undoPop(), null, "이동 없는 선택 클릭은 되돌리기 스택에 아무것도 남기면 안 됨");
  });
  T2.drawsLoad([]); T2._undoReset();
});

test("undo: 핸들만 클릭하고(이동 없이) 놓아도 되돌리기 스택에 아무것도 안 남음", () => {
  const T2 = require("./forge-tools.js");
  withChartShim(() => {
    T2.drawsLoad([{ id: "t4", type: "trend", a: { t: "2026-01-10", p: 100 }, b: { t: "2026-01-20", p: 110 } }]);
    T2._undoReset();
    const G = T2.drawsGeo();
    const fiA = T2.tToFi(G.times, "2026-01-10"), fiB = T2.tToFi(G.times, "2026-01-20");
    const Ax = G.fiToX(fiA), Ay = G.pToY(100), Bx = G.fiToX(fiB), By = G.pToY(110);
    const midx = (Ax + Bx) / 2, midy = (Ay + By) / 2;
    T2.drawsPointerDown({}, midx, midy);   // 선택
    T2.drawsPointerUp();
    T2._undoReset();

    assert.strictEqual(T2.drawsPointerDown({}, Ax, Ay), true, "A 핸들 클릭이 소비되어야 함");
    T2.drawsPointerUp();   // 움직이지 않고 바로 뗀다

    assert.strictEqual(T2.drawsAll()[0].a.p, 100, "실제로 아무 것도 안 바뀌었어야 함(대조군)");
    assert.strictEqual(T2._undoPop(), null, "이동 없는 핸들 클릭도 되돌리기 스택에 아무것도 남기면 안 됨");
  });
  T2.drawsLoad([]); T2._undoReset();
});
