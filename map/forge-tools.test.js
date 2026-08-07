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
      get(o, p) {
        if (p in o) return o[p];
        if (p === "measureText") return s => ({ width: String(s || "").length * 7 });
        // 채널·등락폭·기간의 면 채우기(_fadeFill)는 반환값의 addColorStop 을 부른다 —
        // 프록시 기본 no-op 함수로는 못 받는다(withGeoShim 과 같은 처리).
        if (p === "createLinearGradient") return () => ({ addColorStop() {} });
        return function () {};
      },
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

/* ── F3 리뷰 대응 — redo 오동작 제거(Ctrl+Shift+Z·Ctrl+Y 는 두 번째 undo 였다) ── */

test("undo: Ctrl+Shift+Z 는 false 를 반환하고 스택을 건드리지 않음(redo 로 오동작하던 문제 수정)", () => {
  const T2 = require("./forge-tools.js");
  withChartShim(() => {
    T2.drawsLoad([{ id: "a1", type: "hline", a: { t: "2026-01-10", p: 100 } }]);
    T2._undoReset();
    T2.drawsClear();   // 스택에 스냅샷 1개가 push 됨

    const consumed = T2.drawsKey({ ctrlKey: true, shiftKey: true, key: "z" });
    assert.strictEqual(consumed, false, "Ctrl+Shift+Z 는 false 를 반환해 브라우저로 흘려보내야 함(삼키면 안 됨)");

    // 스택이 안 건드려졌는지 — pop 하면 여전히 스냅샷 1개가 나오고, 그게 유일한 항목이어야 한다
    // (Ctrl+Shift+Z 가 몰래 두 번째 undo 를 수행했다면 여기서 null 이 나오거나 내용이 달라진다).
    const popped = T2._undoPop();
    assert.ok(popped, "Ctrl+Shift+Z 이후에도 스냅샷이 그대로 남아 있어야 함(안 건드림)");
    assert.strictEqual(T2._undoPop(), null, "스택엔 원래 있던 것 딱 하나만 있어야 함(추가로 소비되지 않음)");
  });
  T2.drawsLoad([]); T2._undoReset();
});

test("undo: Ctrl+Y 는 false 를 반환하고 스택을 건드리지 않음(바인딩 완전 제거 확인)", () => {
  const T2 = require("./forge-tools.js");
  withChartShim(() => {
    T2.drawsLoad([{ id: "a1", type: "hline", a: { t: "2026-01-10", p: 100 } }]);
    T2._undoReset();
    T2.drawsClear();   // 스택에 스냅샷 1개가 push 됨

    const consumed = T2.drawsKey({ ctrlKey: true, key: "y" });
    assert.strictEqual(consumed, false, "Ctrl+Y 는 더 이상 바인딩되지 않으므로 false 를 반환해야 함");
    const popped = T2._undoPop();
    assert.ok(popped, "Ctrl+Y 이후에도 스냅샷이 그대로 남아 있어야 함(안 건드림)");
    assert.strictEqual(T2._undoPop(), null, "스택엔 원래 있던 것 딱 하나만 있어야 함");
  });

  T2.drawsLoad([]); T2._undoReset();
});

// "순수 Ctrl+Z(Shift 없이)는 여전히 되돌린다"는 새로 추가하지 않는다 — 이미 위쪽의 여러
// undo 회귀 테스트(예: "두 앵커 그리기(trend) 완성 후 Ctrl+Z", "Delete 키로 지운 그림이
// Ctrl+Z 로 복원됨" 등)가 { ctrlKey: true, key: "z" }(shiftKey 미지정 = falsy)로 이미
// 매번 실제 되돌리기를 확인하고 있다 — 아래 재검증에서 전부 green 유지되는 것으로 충분.

/* ══ Task 6: 시각 규약(정밀 복귀) 회귀 테스트 ═══════════════════════════
   위쪽 withChartShim 의 ctx 는 모든 호출을 삼키는 Proxy 라 "무엇을 어떻게 그렸는지"를
   볼 수 없다. 여기서는 stroke/fill 시점의 lineWidth·globalAlpha·strokeStyle·점선을
   기록하는 ctx 로 바꿔, 선폭·알파·점선·헤일로·save/restore 균형을 실제 값으로 확인한다.
   forge-draw.js 의 CW/CDASH 전역은 node 단독 require 에선 없으므로, forge-tools.js 의
   폴백과 같은 값을 여기에도 둔다(두 곳이 어긋나면 아래 테스트가 먼저 깨진다). */
const CW_ = { hair: 0.85, thin: 1, base: 1.25, bold: 1.6, halo: 1.2 };
const CDASH_ = { fine: [1, 3.5], std: [2, 4], long: [4.5, 4.5] };
const CHART_BG_ = "#0b0f14";   // forge-tools.js _chartBg() 의 node 폴백

function makeRecCtx() {
  const ops = [];
  return {
    ops, lineWidth: 1, globalAlpha: 1, strokeStyle: "#000", fillStyle: "#000",
    lineCap: "butt", lineJoin: "miter", font: "", textAlign: "left", letterSpacing: "0px",
    _dash: [], _stack: [], _unbalanced: 0,
    save() { this._stack.push({ lw: this.lineWidth, ga: this.globalAlpha, ss: this.strokeStyle, fs: this.fillStyle, cap: this.lineCap, join: this.lineJoin, dash: this._dash.slice() }); },
    restore() {
      const s = this._stack.pop();
      if (!s) { this._unbalanced++; return; }
      this.lineWidth = s.lw; this.globalAlpha = s.ga; this.strokeStyle = s.ss; this.fillStyle = s.fs;
      this.lineCap = s.cap; this.lineJoin = s.join; this._dash = s.dash;
    },
    setLineDash(d) { this._dash = (d || []).slice(); },
    getLineDash() { return this._dash.slice(); },
    beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, rect() {}, arc() {}, clip() {},
    setTransform() {}, clearRect() { ops.push({ op: "clear" }); },
    // 라벨 박스 기하를 봐야 ✕ 배지·스와치와의 비겹침 불변식을 단언할 수 있다(roundRect 인자 기록).
    roundRect(x, y, w, h, r) { ops.push({ op: "roundRect", x, y, w, h, r }); },
    // 글꼴·자간은 그리는 시점 값이라야 의미가 있다(§6.1 라벨 규약 검사용).
    fillText(t, x, y) { ops.push({ op: "text", text: t, x, y, font: this.font, ls: this.letterSpacing, color: this.fillStyle }); },
    stroke() { ops.push({ op: "stroke", lineWidth: this.lineWidth, alpha: this.globalAlpha, color: this.strokeStyle, dash: this._dash.slice() }); },
    fill() { ops.push({ op: "fill", alpha: this.globalAlpha, style: this.fillStyle }); },
    fillRect() { ops.push({ op: "fillRect", alpha: this.globalAlpha, style: this.fillStyle }); },
    strokeRect() { ops.push({ op: "strokeRect", lineWidth: this.lineWidth, alpha: this.globalAlpha, color: this.strokeStyle }); },
    measureText(s) { return { width: String(s || "").length * 7 }; },
    createLinearGradient(x0, y0, x1, y1) { const stops = []; return { _grad: true, x0, y0, x1, y1, stops, addColorStop(o, col) { stops.push([o, col]); } }; },
  };
}

/* 기록형 셰임 — ctx 는 한 개를 재사용하고, drawsRender 가 매 호출마다 부르는
   getContext 횟수를 세서 "재드로 횟수"를 정확히 잰다(drawsRender 는 모듈 내부에서
   이름으로 직접 호출되므로 export 를 감싸는 방식으로는 셀 수 없다). */
function withRecShim(fn) {
  const g = { padX: 50, padTop: 20, padBot: 30, ch: 400, histW: 600, plotRight: 650, start: 0, count: 100, log: false, loV: 50, hiV: 150 };
  const times = [];
  { const base = Date.parse("2026-01-01T00:00:00Z"); for (let i = 0; i < 150; i++) times.push(new Date(base + i * 86400000).toISOString().slice(0, 10)); }
  const ctx = makeRecCtx(), counters = { renders: 0 };
  const mainCanvas = { style: {}, width: 0, height: 0, _mainGeo: g, parentElement: { clientWidth: 800, clientHeight: 450 }, getContext: () => ctx };
  const drawsCanvas = { style: {}, width: 0, height: 0, parentElement: { clientWidth: 800, clientHeight: 450 }, getContext() { counters.renders++; return ctx; } };
  const prevDoc = global.document, prevWin = global.window, prevPT = global.priceTimes;
  global.window = { devicePixelRatio: 1 };
  global.document = {
    getElementById(id) { if (id === "fcMainChart") return mainCanvas; if (id === "fcDraws") return drawsCanvas; return null; },
    querySelectorAll() { return []; }, addEventListener() {}, activeElement: null,
  };
  global.priceTimes = () => times;
  try { fn({ times, ctx, counters }); }
  finally { global.document = prevDoc; global.window = prevWin; global.priceTimes = prevPT; }
}

/* 추세선 하나를 실좌표로 올려두고, 선 위의 중점과 두 끝점을 돌려준다.
   b(120) 가 a(90) 보다 위 = 우상단이라, ✕ 배지가 B 쪽으로 가는 "상승 추세선" 케이스다
   (리뷰 I-2 가 지목한 결정적 겹침 조건). */
function seedTrend(T2, times, color) {
  const d = { id: "t1", type: "trend", a: { t: times[10], p: 90 }, b: { t: times[40], p: 120 } };
  if (color) d.color = color;
  T2.drawsLoad([d]);
  const G = T2.drawsGeo();
  const A = { x: G.fiToX(T2.tToFi(times, d.a.t)), y: G.pToY(d.a.p) };
  const B = { x: G.fiToX(T2.tToFi(times, d.b.t)), y: G.pToY(d.b.p) };
  return { d, A, B, mid: { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 } };
}

/* 두 사각형이 겹치는가(경계 접촉은 겹침 아님). I-2 불변식 단언용. */
function rectsOverlap(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}
/* 사각형과 원(✕ 배지 히트원)이 겹치는가. */
function rectHitsCircle(r, cx, cy, rad) {
  const nx = Math.max(r.x, Math.min(cx, r.x + r.w)), ny = Math.max(r.y, Math.min(cy, r.y + r.h));
  return Math.hypot(cx - nx, cy - ny) < rad;
}
/* 라벨 박스만 골라낸다 — 라벨은 높이 16, 스와치는 12, 진행 칩은 22 라 높이로 갈린다. */
function labelRects(ops) { return ops.filter(o => o.op === "roundRect" && o.h === 16); }

test("T6 호버: 같은 도형 위에서 여러 번 움직여도 재드로는 늘지 않는다(팬 프레임 보호)", () => {
  const T2 = require("./forge-tools.js");
  withRecShim(({ times, counters }) => {
    const { mid } = seedTrend(T2, times);
    counters.renders = 0;
    T2.drawsCursor(mid.x, mid.y);                       // 도형 위로 처음 진입 → 1회
    assert.strictEqual(counters.renders, 1, "호버가 처음 잡힐 때 한 번은 그려야 함");
    for (let i = 0; i < 20; i++) T2.drawsCursor(mid.x + (i % 5) * 0.3, mid.y);   // 같은 도형 위 미세 이동 20회
    assert.strictEqual(counters.renders, 1, "호버 대상이 그대로면 재드로가 늘면 안 됨(매 move 재드로 금지)");
    T2.drawsCursor(60, 30);                             // 도형 밖 → 해제로 1회만 더
    assert.strictEqual(counters.renders, 2, "호버가 풀릴 때만 한 번 더");
    for (let i = 0; i < 20; i++) T2.drawsCursor(60 + i * 0.2, 30);
    assert.strictEqual(counters.renders, 2, "빈 곳에서 계속 움직여도 재드로 없음");
  });
  T2.drawsLoad([]); T2._undoReset();
});

test("T6 선택: 굵기는 그대로 두고 헤일로로 떠오른다(선택해도 본선이 굵어지지 않음)", () => {
  const T2 = require("./forge-tools.js");
  withRecShim(({ times, ctx }) => {
    const { mid } = seedTrend(T2, times, "#123456");
    // 비선택 렌더
    ctx.ops.length = 0; T2.drawsRender();
    const un = ctx.ops.filter(o => o.op === "stroke" && o.color === "#123456" && o.alpha < 1);
    assert.strictEqual(un.length, 1, "비선택이면 본선 1개뿐(헤일로 없음)");
    assert.strictEqual(un[0].lineWidth, CW_.base, "본선 굵기는 CW.base");
    assert.ok(Math.abs(un[0].alpha - .88) < 1e-9, "비호버 알파는 .88: " + un[0].alpha);

    // 선택(본체 클릭) 후 렌더
    T2.drawsPointerDown({}, mid.x, mid.y); T2.drawsPointerUp();
    ctx.ops.length = 0; T2.drawsRender();
    const se = ctx.ops.filter(o => o.op === "stroke" && o.color === "#123456" && o.alpha < 1);
    const halo = se.filter(o => Math.abs(o.alpha - .18) < 1e-9);
    const main = se.filter(o => Math.abs(o.alpha - .88) < 1e-9);
    assert.strictEqual(halo.length, 1, "선택 시 헤일로 1획이 본선 아래 깔려야 함");
    assert.strictEqual(halo[0].lineWidth, CW_.base + CW_.halo * 3, "헤일로 굵기 = 본선 + halo*3");
    assert.strictEqual(main.length, 1, "본선은 여전히 1획");
    assert.strictEqual(main[0].lineWidth, CW_.base, "선택해도 본선 굵기 불변(굵히기 금지): " + main[0].lineWidth);
  });
  T2.drawsLoad([]); T2._undoReset();
});

test("T6 호버 예광: 알파만 1로 오르고 굵기는 불변", () => {
  const T2 = require("./forge-tools.js");
  withRecShim(({ times, ctx }) => {
    const { mid } = seedTrend(T2, times, "#123456");
    T2.drawsCursor(mid.x, mid.y);                       // 선택하지 않고 호버만(스와치·배지 없음)
    ctx.ops.length = 0; T2.drawsRender();
    const body = ctx.ops.filter(o => o.op === "stroke" && o.color === "#123456");
    assert.strictEqual(body.length, 1, "선택 안 했으니 본선 1획뿐");
    assert.strictEqual(body[0].alpha, 1, "호버 시 알파는 1");
    assert.strictEqual(body[0].lineWidth, CW_.base, "호버해도 굵기는 불변: " + body[0].lineWidth);
  });
  T2.drawsLoad([]); T2._undoReset();
});

test("T6 핸들: 평시엔 속 빈 링(차트 배경 채움), 호버 때만 색으로 채워진다", () => {
  const T2 = require("./forge-tools.js");
  withRecShim(({ times, ctx }) => {
    const { mid } = seedTrend(T2, times, "#123456");
    T2.drawsPointerDown({}, mid.x, mid.y); T2.drawsPointerUp();   // 선택
    T2.drawsCursor(60, 30);                                        // 호버는 확실히 해제
    ctx.ops.length = 0; T2.drawsRender();
    const hollow = ctx.ops.filter(o => o.op === "fill" && o.style === CHART_BG_);
    const filled = ctx.ops.filter(o => o.op === "fill" && o.style === "#123456");
    assert.strictEqual(hollow.length, 2, "끝점 2개가 속 빈 링(배경 채움)이어야 함: " + hollow.length);
    assert.strictEqual(filled.length, 0, "비호버에선 핸들이 색으로 차면 안 됨");

    T2.drawsCursor(mid.x, mid.y);                                  // 같은 도형에 호버
    ctx.ops.length = 0; T2.drawsRender();
    const filled2 = ctx.ops.filter(o => o.op === "fill" && o.style === "#123456");
    assert.strictEqual(filled2.length, 2, "호버 시 끝점 2개가 채워져야 함: " + filled2.length);
  });
  T2.drawsLoad([]); T2._undoReset();
});

test("T6 점선: 박스(range)·hline 은 차트 본체의 CDASH.fine 을 쓴다", () => {
  const T2 = require("./forge-tools.js");
  withRecShim(({ times, ctx }) => {
    T2.drawsLoad([
      { id: "r1", type: "range", color: "#123456", a: { t: times[10], p: 90 }, b: { t: times[40], p: 120 } },
      { id: "h1", type: "hline", color: "#654321", a: { t: times[10], p: 100 } },
    ]);
    ctx.ops.length = 0; T2.drawsRender();
    const box = ctx.ops.filter(o => o.op === "stroke" && o.color === "#123456");
    assert.strictEqual(box.length, 1);
    assert.deepStrictEqual(box[0].dash, CDASH_.fine, "박스 점선은 CDASH.fine(정밀 규약) 이어야 함: " + JSON.stringify(box[0].dash));
    const hl = ctx.ops.filter(o => o.op === "stroke" && o.color === "#654321");
    assert.strictEqual(hl.length, 1);
    assert.deepStrictEqual(hl[0].dash, CDASH_.fine, "hline 점선도 CDASH.fine");
  });
  T2.drawsLoad([]); T2._undoReset();
});

test("T6 채움: 채널·박스는 균일 알파 판때기가 아니라 기준선 → 바깥 페이드 그라디언트", () => {
  const T2 = require("./forge-tools.js");
  withRecShim(({ times, ctx }) => {
    T2.drawsLoad([
      { id: "c1", type: "channel", color: "#123456", off: 12, a: { t: times[10], p: 90 }, b: { t: times[40], p: 120 } },
      { id: "r1", type: "range", color: "#654321", a: { t: times[50], p: 95 }, b: { t: times[80], p: 130 } },
    ]);
    ctx.ops.length = 0; T2.drawsRender();
    const chFill = ctx.ops.filter(o => o.op === "fill" && o.style && o.style._grad);
    assert.strictEqual(chFill.length, 1, "채널 채움이 그라디언트여야 함");
    assert.deepStrictEqual(chFill[0].style.stops, [[0, "#12345622"], [1, "#12345605"]], "기준선 쪽이 짙고 바깥이 옅어야 함");
    assert.strictEqual(chFill[0].alpha, 1, "그라디언트를 쓰므로 globalAlpha 로 눌러 그리지 않는다");
    const boxFill = ctx.ops.filter(o => o.op === "fillRect" && o.style && o.style._grad);
    assert.strictEqual(boxFill.length, 1, "박스 채움도 같은 어법");
    assert.deepStrictEqual(boxFill[0].style.stops, [[0, "#65432122"], [1, "#65432105"]]);
  });
  T2.drawsLoad([]); T2._undoReset();
});

test("T6 ✕ 배지: 평시 알파 .45 로 물러나 있다가 호버 시 1", () => {
  const T2 = require("./forge-tools.js");
  withRecShim(({ times, ctx }) => {
    const { mid } = seedTrend(T2, times, "#123456");
    T2.drawsPointerDown({}, mid.x, mid.y); T2.drawsPointerUp();
    T2.drawsCursor(60, 30);
    ctx.ops.length = 0; T2.drawsRender();
    const bad = ctx.ops.filter(o => o.op === "stroke" && o.color === "#e06a6a");
    assert.ok(bad.length >= 1, "선택하면 ✕ 배지가 그려져야 함");
    assert.ok(bad.every(o => Math.abs(o.alpha - .45) < 1e-9), "비호버 배지는 알파 .45: " + JSON.stringify(bad.map(o => o.alpha)));

    T2.drawsCursor(mid.x, mid.y);
    ctx.ops.length = 0; T2.drawsRender();
    const bad2 = ctx.ops.filter(o => o.op === "stroke" && o.color === "#e06a6a");
    assert.ok(bad2.length >= 1);
    assert.ok(bad2.every(o => o.alpha === 1), "호버 시 배지는 알파 1: " + JSON.stringify(bad2.map(o => o.alpha)));
  });
  T2.drawsLoad([]); T2._undoReset();
});

// 이름 정정(리뷰 M-10): 픽셀을 재는 게 아니라 "획이 몇 번, 어떤 굵기·색으로 나가는가"를 센다.
// 실제 픽셀 잉크는 헤드리스 하네스(_t6verify.html 6번)가 getImageData 로 따로 확인한다.
test("T6 하위호환: color·w 없는 1차 포맷 그림도 기본 색·CW.base 로 획이 나간다", () => {
  const T2 = require("./forge-tools.js");
  withRecShim(({ times, ctx }) => {
    T2.drawsLoad([
      { id: "o1", type: "trend", a: { t: times[10], p: 90 }, b: { t: times[40], p: 120 } },
      { id: "o2", type: "channel", off: 8, a: { t: times[50], p: 95 }, b: { t: times[80], p: 130 } },
      { id: "o3", type: "period", a: { t: times[90], p: 100 }, b: { t: times[110], p: 120 } },
      { id: "o4", type: "hline", a: { t: times[10], p: 110 } },
    ]);
    ctx.ops.length = 0; T2.drawsRender();
    const strokes = ctx.ops.filter(o => o.op === "stroke");
    assert.ok(strokes.length >= 5, "네 도형이 모두 그려져야 함(추세1·채널2·박스1·hline1): " + strokes.length);
    assert.ok(strokes.every(o => o.lineWidth === CW_.base), "w 미지정이면 전부 CW.base: " + JSON.stringify(strokes.map(o => o.lineWidth)));
    assert.ok(strokes.some(o => o.color === "#e8b463"), "trend 기본색(골드)");
    assert.ok(strokes.some(o => o.color === "#5b8def"), "channel 기본색(블루)");
  });
  T2.drawsLoad([]); T2._undoReset();
});

test("T6 상태 누수: 한 프레임의 save/restore 가 균형 잡혀 있다(다음 프레임으로 안 샘)", () => {
  const T2 = require("./forge-tools.js");
  withRecShim(({ times, ctx }) => {
    // drawsAll() 이 라이브 배열을 돌려준다는 구현 세부에 기대지 않는다(리뷰 M-10) — 공개 API 로 싣는다.
    T2.drawsLoad([
      { id: "t1", type: "trend", color: "#123456", a: { t: times[10], p: 90 }, b: { t: times[40], p: 120 } },
      { id: "c1", type: "channel", off: 12, a: { t: times[50], p: 95 }, b: { t: times[80], p: 130 } },
      { id: "r1", type: "range", a: { t: times[90], p: 100 }, b: { t: times[110], p: 120 } },
      { id: "h1", type: "hline", a: { t: times[10], p: 110 } },
      { id: "v1", type: "vline", a: { t: times[60], p: 100 } },
    ]);
    const G = T2.drawsGeo();
    const mid = { x: (G.fiToX(T2.tToFi(times, times[10])) + G.fiToX(T2.tToFi(times, times[40]))) / 2,
                  y: (G.pToY(90) + G.pToY(120)) / 2 };
    T2.drawsPointerDown({}, mid.x, mid.y); T2.drawsPointerUp();   // 선택 상태까지 포함
    ctx._stack.length = 0; ctx._unbalanced = 0; ctx.ops.length = 0;
    T2.drawsRender();
    assert.strictEqual(ctx._stack.length, 0, "save 가 남아 있으면 다음 프레임 전체에 알파·점선이 샌다");
    assert.strictEqual(ctx._unbalanced, 0, "restore 가 save 보다 많으면 안 됨");
    // 점선·알파가 초기 상태로 돌아왔는지도 확인
    assert.deepStrictEqual(ctx.getLineDash(), [], "프레임 끝에 점선이 남으면 안 됨");
    assert.strictEqual(ctx.globalAlpha, 1, "프레임 끝에 알파가 남으면 안 됨");
    assert.strictEqual(ctx.ops.filter(o => o.op === "clear").length, 1, "한 프레임에 캔버스는 정확히 한 번만 지운다");
  });
  T2.drawsLoad([]); T2._undoReset();
});

/* ── 리뷰 대응 회귀 (I-1 · I-2 · M-1 · M-2 · M-5 · 헤일로 순서 · 핸들 타입가드) ── */

test("T6-R I-1 테마: trend·hline 기본색은 FC_GOLD 를 그릴 때 읽는다(라이트 테마 추종)", () => {
  const T2 = require("./forge-tools.js");
  withRecShim(({ times, ctx }) => {
    T2.drawsLoad([
      { id: "t1", type: "trend", a: { t: times[10], p: 90 }, b: { t: times[40], p: 120 } },
      { id: "h1", type: "hline", a: { t: times[10], p: 110 } },
      { id: "c1", type: "channel", off: 8, a: { t: times[50], p: 95 }, b: { t: times[80], p: 130 } },
    ]);
    // 다크(FC_GOLD 미정의 = node 폴백)
    ctx.ops.length = 0; T2.drawsRender();
    let cols = ctx.ops.filter(o => o.op === "stroke").map(o => o.color);
    assert.ok(cols.includes("#e8b463"), "폴백은 웜골드: " + JSON.stringify(cols));

    // 라이트 테마 — _syncChartColors() 가 하는 일을 그대로 흉내낸다(전역 재대입)
    const prev = global.FC_GOLD;
    global.FC_GOLD = "#3a4656";
    try {
      ctx.ops.length = 0; T2.drawsRender();
      cols = ctx.ops.filter(o => o.op === "stroke").map(o => o.color);
      assert.ok(cols.includes("#3a4656"), "trend·hline 은 슬레이트로 따라가야 함: " + JSON.stringify(cols));
      assert.ok(!cols.includes("#e8b463"), "웜골드가 남아 있으면 흰 배경에서 안 읽힌다: " + JSON.stringify(cols));
      assert.ok(cols.includes("#5b8def"), "채널 블루는 테마 무관 상수라 그대로여야 함");
      // 라벨 색도 같은 값을 따라가는지(획만 고치고 라벨을 빠뜨리는 게 흔한 실수)
      const txt = ctx.ops.filter(o => o.op === "text").map(o => o.color);
      assert.ok(txt.includes("#3a4656"), "라벨 글자색도 테마를 따라야 함: " + JSON.stringify(txt));
    } finally { if (prev === undefined) delete global.FC_GOLD; else global.FC_GOLD = prev; }

    // 사용자가 스와치로 고른 색은 테마와 무관하게 그대로(SW_COLORS 는 리터럴 유지)
    T2.drawsLoad([{ id: "t2", type: "trend", color: T2.SW_COLORS[1], a: { t: times[10], p: 90 }, b: { t: times[40], p: 120 } }]);
    global.FC_GOLD = "#3a4656";
    try {
      ctx.ops.length = 0; T2.drawsRender();
      const c2 = ctx.ops.filter(o => o.op === "stroke").map(o => o.color);
      assert.ok(c2.includes(T2.SW_COLORS[1]), "사용자 지정색은 테마가 덮어쓰면 안 됨");
    } finally { delete global.FC_GOLD; }
  });
  T2.drawsLoad([]); T2._undoReset();
});

test("T6-R I-2 겹침: 선택 시 값 라벨이 ✕ 배지 히트원·스와치 줄과 겹치지 않는다", () => {
  const T2 = require("./forge-tools.js");
  withRecShim(({ times, ctx }) => {
    // 상승 추세선(b 가 우상단) — 리뷰가 지목한 결정적 겹침 조건 + 폭보다 라벨이 긴 좁은 박스
    const cases = [
      { id: "t1", type: "trend", a: { t: times[10], p: 90 }, b: { t: times[40], p: 120 } },
      { id: "r1", type: "range", a: { t: times[60], p: 100 }, b: { t: times[62], p: 104 } },
    ];
    for (const d of cases) {
      T2.drawsLoad([d]);
      const G = T2.drawsGeo();
      const A = { x: G.fiToX(T2.tToFi(times, d.a.t)), y: G.pToY(d.a.p) };
      const B = { x: G.fiToX(T2.tToFi(times, d.b.t)), y: G.pToY(d.b.p) };
      // 추세선은 선 위 중점, 박스는 **테두리**(윗변 중점) — 박스 내부는 히트 대상이 아니다.
      const pick = d.type === "trend"
        ? { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 }
        : { x: (A.x + B.x) / 2, y: Math.min(A.y, B.y) };
      T2.drawsPointerDown({}, pick.x, pick.y); T2.drawsPointerUp();
      ctx.ops.length = 0; T2.drawsRender();
      // 선택이 실제로 됐는지 먼저 확인 — 선택이 안 된 채로도 "안 겹친다"가 통과해버리면
      // 이 테스트는 아무것도 검증하지 않는다(실제로 처음에 이렇게 새어나갔다).
      assert.ok(ctx.ops.some(o => o.op === "strokeRect"), d.type + ": 선택 상태여야 함(스와치 활성 링이 없다)");

      const labels = labelRects(ctx.ops);
      assert.strictEqual(labels.length, 1, d.type + ": 값 라벨 박스가 정확히 하나여야 함");
      const L = labels[0];
      const badge = T2._delBadge(G, d), sw = T2._swatchRects(G, d);
      assert.ok(badge && sw.length, d.type + ": 배지·스와치가 그려지는 상태여야 유효한 검사");
      assert.ok(!rectHitsCircle(L, badge.x, badge.y, badge.r + 2),
        d.type + ": 라벨이 ✕ 배지 히트원과 겹침 — label=" + JSON.stringify(L) + " badge=" + JSON.stringify(badge));
      for (const r of sw)
        assert.ok(!rectsOverlap(L, r), d.type + ": 라벨이 스와치 칸과 겹침 — label=" + JSON.stringify(L) + " sw=" + JSON.stringify(r));
      // 불변식 자체도 직접 확인: 라벨 오른쪽 끝 ≤ 도형 오른쪽 끝 < 군집 왼쪽 끝
      assert.ok(L.x + L.w <= Math.max(A.x, B.x) + 1e-9,
        d.type + ": 라벨 우측 끝이 도형 우측 끝을 넘으면 군집 침범 가능 — " + (L.x + L.w) + " vs " + Math.max(A.x, B.x));
    }
  });
  T2.drawsLoad([]); T2._undoReset();
});

test("T6-R I-2 비선택: 선택하지 않았으면 라벨은 종전 자리(앵커 오른쪽)에 그대로", () => {
  const T2 = require("./forge-tools.js");
  withRecShim(({ times, ctx }) => {
    const { B } = seedTrend(T2, times);
    ctx.ops.length = 0; T2.drawsRender();
    const L = labelRects(ctx.ops)[0];
    assert.ok(L, "라벨이 있어야 함");
    assert.ok(L.x >= B.x, "평소엔 끝점 오른쪽에서 시작(비켜서기는 선택 중에만): " + L.x + " vs " + B.x);
  });
  T2.drawsLoad([]); T2._undoReset();
});

test("T6-R M-3 라벨 규약: 600 11px · 자간 -0.2px · 라디우스 3(--r-sm)", () => {
  const T2 = require("./forge-tools.js");
  withRecShim(({ times, ctx }) => {
    seedTrend(T2, times);
    ctx.ops.length = 0; T2.drawsRender();
    const t = ctx.ops.filter(o => o.op === "text")[0];
    assert.ok(t, "라벨 글자가 있어야 함");
    assert.ok(/^600 11px/.test(t.font), "지표 작도 라벨과 같은 600 11px 이어야 함: " + t.font);
    assert.strictEqual(t.ls, "-0.2px", "자간 -0.2px(진행 칩과 동일): " + t.ls);
    assert.strictEqual(labelRects(ctx.ops)[0].r, 3, "라디우스는 3토큰 중 --r-sm");
  });
  T2.drawsLoad([]); T2._undoReset();
});

test("T6-R M-1 격리: 앞 도형의 점선이 뒤 도형으로 새지 않는다(도형별 save/restore)", () => {
  const T2 = require("./forge-tools.js");
  withRecShim(({ times, ctx }) => {
    // hline 은 CDASH.fine 을 걸고 그리고, 그 뒤 trend 는 실선이어야 한다.
    // _renderOne 안에서 중간에 setLineDash([]) 로 되돌리지 않으므로, 이 격리는
    // 오직 도형별 save/restore 쌍만이 제공한다 — 쌍을 통째로 지우면 이 단언이 깨진다.
    T2.drawsLoad([
      { id: "h1", type: "hline", color: "#654321", a: { t: times[10], p: 110 } },
      { id: "t1", type: "trend", color: "#123456", a: { t: times[20], p: 90 }, b: { t: times[40], p: 120 } },
    ]);
    ctx.ops.length = 0; T2.drawsRender();
    const hl = ctx.ops.filter(o => o.op === "stroke" && o.color === "#654321");
    const tr = ctx.ops.filter(o => o.op === "stroke" && o.color === "#123456");
    assert.strictEqual(hl.length, 1); assert.strictEqual(tr.length, 1);
    assert.deepStrictEqual(hl[0].dash, CDASH_.fine, "hline 은 점선");
    assert.deepStrictEqual(tr[0].dash, [], "뒤따르는 추세선은 실선이어야 함 — 점선이 새면 여기서 잡힌다");
  });
  T2.drawsLoad([]); T2._undoReset();
});

test("T6-R M-2 예외 누수: 손상된 그림이 throw 해도 save 깊이가 원래대로 돌아온다", () => {
  const T2 = require("./forge-tools.js");
  withRecShim(({ times, ctx }) => {
    // b 없는 trend = 손편집된 forge_data.json 같은 손상 데이터. _pt(G, undefined) 에서 throw 한다.
    T2.drawsLoad([{ id: "bad", type: "trend", a: { t: times[10], p: 90 } }]);
    ctx._stack.length = 0; ctx._unbalanced = 0;
    let threw = 0;
    for (let i = 0; i < 3; i++) { try { T2.drawsRender(); } catch (e) { threw++; } }
    assert.strictEqual(threw, 3, "이 픽스처는 실제로 던져야 검사가 성립한다(안 던지면 무의미 검증)");
    assert.strictEqual(ctx._stack.length, 0,
      "예외가 나도 save 가 남으면 안 된다 — forge-draw 의 catch 가 삼켜 프레임마다 영구 누적된다(깊이 " + ctx._stack.length + ")");
    assert.strictEqual(ctx._unbalanced, 0, "restore 초과도 없어야 함");
  });
  T2.drawsLoad([]); T2._undoReset();
});

test("T6-R 헤일로 순서: 헤일로는 본선보다 '먼저' 그려진다(아래에 깔려야 함)", () => {
  const T2 = require("./forge-tools.js");
  withRecShim(({ times, ctx }) => {
    const { mid } = seedTrend(T2, times, "#123456");
    T2.drawsPointerDown({}, mid.x, mid.y); T2.drawsPointerUp();   // 선택
    ctx.ops.length = 0; T2.drawsRender();
    const iHalo = ctx.ops.findIndex(o => o.op === "stroke" && o.color === "#123456" && Math.abs(o.alpha - .18) < 1e-9);
    const iMain = ctx.ops.findIndex(o => o.op === "stroke" && o.color === "#123456" && Math.abs(o.alpha - .88) < 1e-9);
    assert.ok(iHalo >= 0 && iMain >= 0, "헤일로와 본선이 둘 다 있어야 함");
    assert.ok(iHalo < iMain,
      "순서가 뒤집히면 옅은 후광이 본선 '위'를 덮어 선이 흐려진다 — halo=" + iHalo + " main=" + iMain);
  });
  T2.drawsLoad([]); T2._undoReset();
});

test("T6-R M-5 채움 방향: 급경사 채널에서도 그라디언트가 뒤집히지 않는다(항상 위가 짙음)", () => {
  const T2 = require("./forge-tools.js");
  withRecShim(({ times, ctx }) => {
    // a(90) → b(140) 급상승 + off 양수 → 예전 공식 min(A.y,A2.y) > max(B.y,B2.y) 로 방향 반전
    T2.drawsLoad([{ id: "c1", type: "channel", color: "#123456", off: 5,
                    a: { t: times[10], p: 90 }, b: { t: times[40], p: 140 } }]);
    const G = T2.drawsGeo();
    ctx.ops.length = 0; T2.drawsRender();
    const gd = ctx.ops.filter(o => o.op === "fill" && o.style && o.style._grad)[0];
    assert.ok(gd, "채널 채움은 그라디언트");
    assert.ok(gd.style.y0 < gd.style.y1,
      "짙은 끝(stop 0)이 위여야 한다 — y0=" + gd.style.y0 + " y1=" + gd.style.y1 + " (뒤집히면 아래가 짙어져 다른 도형과 어법이 어긋난다)");
    // 방향뿐 아니라 **범위**도 도형의 세로 bbox 전체여야 한다. 네 점(a·b·a+off·b+off) 중
    // 최상단은 b+off(145), 최하단은 a(90). 두 변을 섞는 옛 공식은 95~140 이라 범위가 좁아지고,
    // 채움이 도형 위/아래 끝에서 끊긴 것처럼 보인다 — 방향만 보면 정규화에 가려 안 잡힌다.
    assert.ok(Math.abs(gd.style.y0 - G.pToY(145)) < 1e-6,
      "그라디언트 시작은 도형 최상단(=b+off) 이어야 함: " + gd.style.y0 + " vs " + G.pToY(145));
    assert.ok(Math.abs(gd.style.y1 - G.pToY(90)) < 1e-6,
      "그라디언트 끝은 도형 최하단(=a) 이어야 함: " + gd.style.y1 + " vs " + G.pToY(90));
    assert.deepStrictEqual(gd.style.stops, [[0, "#12345622"], [1, "#12345605"]]);
  });
  T2.drawsLoad([]); T2._undoReset();
});

test("T6-R 핸들 타입가드: hline·vline 은 앵커 위에서도 handle 이 아니라 body 로 잡힌다", () => {
  const T2 = require("./forge-tools.js");
  withRecShim(({ times }) => {
    for (const [type, key] of [["hline", "p"], ["vline", "t"]]) {
      const d = { id: "x1", type, a: { t: times[40], p: 110 } };
      T2.drawsLoad([d]);
      const G = T2.drawsGeo();
      const ax = G.fiToX(T2.tToFi(times, d.a.t)), ay = G.pToY(d.a.p);   // 저장된 앵커의 화면 좌표
      T2.drawsPointerDown({}, ax, ay); T2.drawsPointerUp();             // 선택
      const h = T2.drawsHitTest(ax, ay);
      assert.strictEqual(h.kind, "body", type + ": 끝점이 없는 도형은 handle 로 잡히면 안 됨");

      // 그리고 클릭해도 선이 튀지 않는다 — 누른 자리에서 안 움직이면 값도 그대로여야 한다.
      const before = { t: d.a.t, p: d.a.p };
      T2.drawsPointerDown({}, ax, ay); T2.drawsPointerUp();
      assert.strictEqual(d.a.t, before.t, type + ": 클릭만으로 t 가 바뀌면 안 됨");
      assert.strictEqual(d.a.p, before.p, type + ": 클릭만으로 p 가 바뀌면 안 됨(선이 커서로 튀는 증상)");

      // 이동은 축 고정 move 경로 — 고정축은 불변, 이동축만 변한다.
      T2.drawsPointerDown({}, ax, ay);
      T2.drawsPointerMove({}, ax + 40, ay + 30);
      T2.drawsPointerUp();
      if (key === "p") { assert.strictEqual(d.a.t, before.t, "hline 은 t 고정"); assert.ok(Math.abs(d.a.p - before.p) > 1e-6, "hline 은 p 가 변함"); }
      else { assert.notStrictEqual(d.a.t, before.t, "vline 은 t 가 변함"); assert.strictEqual(d.a.p, before.p, "vline 은 p 고정"); }
    }
  });
  T2.drawsLoad([]); T2._undoReset();
});

test("T6-R 스와치 실선: 점선 도형(hline)을 선택해도 스와치 획은 점선이 되지 않는다", () => {
  const T2 = require("./forge-tools.js");
  withRecShim(({ times, ctx }) => {
    // 도형 내부의 중간 setLineDash([]) 되돌리기를 없애고 격리를 save/restore 로 옮겼으므로,
    // 선택 UI(핸들·배지·스와치)는 각자 실선을 보장해야 한다 — 스와치가 그 짝이다.
    const d = { id: "h1", type: "hline", color: "#123456", a: { t: times[40], p: 110 } };
    T2.drawsLoad([d]);
    const G = T2.drawsGeo();
    T2.drawsPointerDown({}, 300, G.pToY(110)); T2.drawsPointerUp();   // 선택
    ctx.ops.length = 0; T2.drawsRender();
    const sw = T2._swatchRects(G, d);
    assert.ok(sw.length, "스와치가 그려지는 상태여야 함");
    // 본선(알파 < 1)만 점선이고, 선택 UI 의 획(알파 1)은 전부 실선이어야 한다.
    const ui = ctx.ops.filter(o => o.op === "stroke" && o.alpha === 1);
    assert.ok(ui.length >= 4, "핸들·배지·스와치 획이 있어야 함: " + ui.length);
    for (const o of ui)
      assert.deepStrictEqual(o.dash, [], "선택 UI 획이 점선으로 샜다 — " + JSON.stringify(o));
    const body = ctx.ops.filter(o => o.op === "stroke" && o.alpha < 1);
    assert.ok(body.length && body.every(o => o.dash.length === 0 || o.dash[0] === CDASH_.fine[0]),
      "본선은 여전히 fine 점선(또는 실선 헤일로)이어야 함");
  });
  T2.drawsLoad([]); T2._undoReset();
});

test("T6-R 스와치 링: 현재 굵기 칸에 활성 링(strokeRect)이 정확히 하나", () => {
  const T2 = require("./forge-tools.js");
  withRecShim(({ times, ctx }) => {
    const { mid } = seedTrend(T2, times, "#123456");
    T2.drawsPointerDown({}, mid.x, mid.y); T2.drawsPointerUp();
    ctx.ops.length = 0; T2.drawsRender();
    const rings = ctx.ops.filter(o => o.op === "strokeRect");
    assert.strictEqual(rings.length, 1, "굵기 3칸 중 현재 값 하나에만 링: " + rings.length);
    assert.strictEqual(rings[0].lineWidth, CW_.hair, "링은 헤어라인 — 스와치 자체보다 굵으면 안 됨");
  });
  T2.drawsLoad([]); T2._undoReset();
});

test("T6 이탈: drawsHoverClear 는 예광을 끄고, 이미 꺼져 있으면 재드로하지 않는다", () => {
  const T2 = require("./forge-tools.js");
  withRecShim(({ times, counters }) => {
    const { mid } = seedTrend(T2, times);
    T2.drawsCursor(mid.x, mid.y);
    counters.renders = 0;
    assert.strictEqual(T2.drawsHoverClear(), true, "켜져 있던 예광은 꺼져야 함");
    assert.strictEqual(counters.renders, 1, "해제는 한 번 그린다");
    assert.strictEqual(T2.drawsHoverClear(), false, "이미 꺼져 있으면 아무 일도 없어야 함");
    assert.strictEqual(counters.renders, 1, "불필요한 재드로 금지");
  });
  T2.drawsLoad([]); T2._undoReset();
});

/* ══ FINAL 리뷰 대응 (I-1 스와치↔핸들 · M-9 hline 오클릭 · I-2 굵기 페인트) ═══════════
   forge-tools.js 내부 상수와 같은 값(비노출) — 어긋나면 아래 단언이 먼저 깨진다. */
const HR_VIS_ = 4.5, DEL_R_ = 9, BODY_R_ = 5;
/* 링 위 8방향 표본 — "그려진 핸들 위 어디를 눌러도" 를 재려면 중심 하나로는 부족하다. */
function ringPts(cx, cy, r) {
  const out = [{ x: cx, y: cy }];
  for (let k = 0; k < 8; k++) out.push({ x: cx + r * Math.cos(k * Math.PI / 4), y: cy + r * Math.sin(k * Math.PI / 4) });
  return out;
}

test("FINAL I-1 회귀: 그려진 끝점 핸들 위를 누르면 항상 handle — 스와치·배지가 삼키면 안 됨", () => {
  const T2 = require("./forge-tools.js");
  withRecShim(({ times }) => {
    const cases = [
      // ① 리뷰 재현 조건 — 오른쪽 끝이 플롯 우측에 가까워 스와치 줄(폭 122)이 왼쪽으로
      //    클램프되며 핸들 b(x 534.8) 위에 얹혔다. 회귀 전 결과: {kind:"swatch"} → 선이 골드로.
      { id: "t1", type: "trend", a: { t: times[20], p: 55 }, b: { t: times[80], p: 52 } },
      // ② 스윕이 새로 찾아낸 **파괴적** 짝 — 도형 위끝이 플롯 상단에 붙으면 _delBadge 의 y 가
      //    padTop+DEL_R+2 로 클램프돼 배지가 핸들 쪽으로 내려온다. 배지 판정원(db.r+2)은 그려진
      //    원(db.r)보다 2px 넉넉해서, 그 여유분이 핸들 링을 덮으면 화면엔 핸들이 보이는데
      //    클릭은 {kind:"del"} = 도형 삭제였다.
      { id: "t2", type: "trend", a: { t: times[0], p: 52 }, b: { t: times[88], p: 148 } },
    ];
    for (const d of cases) {
      T2.drawsLoad([d]);
      const G = T2.drawsGeo();
      const A = { x: G.fiToX(T2.tToFi(times, d.a.t)), y: G.pToY(d.a.p) };
      const B = { x: G.fiToX(T2.tToFi(times, d.b.t)), y: G.pToY(d.b.p) };
      T2.drawsPointerDown({}, (A.x + B.x) / 2, (A.y + B.y) / 2); T2.drawsPointerUp();   // 본체 클릭으로 선택
      const sw = T2._swatchRects(G, d), badge = T2._delBadge(G, d);
      assert.ok(sw.length && badge, d.id + ": 선택 상태(스와치·배지가 있는 상태)여야 유효한 검사");

      for (const [P, which] of [[A, "a"], [B, "b"]])
        for (const q of ringPts(P.x, P.y, HR_VIS_ * 0.98)) {
          // ✕ 배지가 실제로 **그려진** 원 안은 배지 몫 — 거기서 보이는 건 배지다(그리기 순서와 일치).
          if (Math.hypot(q.x - badge.x, q.y - badge.y) <= DEL_R_) continue;
          const h = T2.drawsHitTest(q.x, q.y);
          assert.ok(h && h.kind === "handle" && h.id === d.id,
            d.id + " " + which + " 핸들 링 위 클릭이 " + (h ? h.kind : "null") + " 로 먹혔다 — " + JSON.stringify(q));
        }
      // 배치 불변식 자체도 확인 — 판정 순서에만 기대면 "보이는데 덮여 있다"는 미관 결함이 남는다.
      for (const r of sw) {
        for (const P of [A, B])
          assert.ok(!rectHitsCircle(r, P.x, P.y, HR_VIS_), d.id + ": 스와치가 핸들 링을 덮었다 — " + JSON.stringify(r));
        assert.ok(!rectHitsCircle(r, badge.x, badge.y, badge.r + 2), d.id + ": Task 4 불변식 위반(스와치 ∩ 배지 히트원)");
      }
    }
    /* 링 바깥의 넉넉한 판정(HR=11)도 살아 있어야 한다 — 4.5px 링을 마우스로 정확히 맞히는 건
       사실상 불가능해서(F4 라운드 실측) 항상 본체가 먼저 잡히던 증상의 해법이 이 여유다.
       군집(배지·스와치)에서 먼 아래쪽 앵커로 확인한다. */
    const { A: LA } = seedTrend(T2, times, "#123456");
    T2.drawsPointerDown({}, LA.x, LA.y); T2.drawsPointerUp();
    for (const dx of [-8, 8]) {
      const h = T2.drawsHitTest(LA.x + dx, LA.y);
      assert.ok(h && h.kind === "handle" && h.which === "a",
        "링 밖 " + Math.abs(dx) + "px(HR 안)도 handle 이어야 함 — " + (h ? h.kind : "null"));
    }
  });
  T2.drawsLoad([]); T2._undoReset();
});

test("FINAL I-1 배치 스윕: 4종 × 앵커 격자 전부에서 스와치가 핸들 링·배지 히트원을 안 덮는다", () => {
  const T2 = require("./forge-tools.js");
  withRecShim(({ times }) => {
    let checked = 0;
    for (const type of ["trend", "channel", "range", "period"])
      // 51/141/봉80 은 스윕 스크립트가 찾아낸 **파괴적** 조합 자리다 — 도형 위끝이 플롯 상단에
      // 붙어 배지 y 가 클램프되고 오른쪽 끝이 우측 가장자리에 가까운 구간. 격자에서 빼면
      // "스와치 ↔ 배지 히트원" 회피를 통째로 지워도 스위트가 초록으로 남는다(실측).
      for (const ab of [0, 25, 50, 75, 95]) for (const ap of [51, 55, 90, 125, 148])
        for (const bb of [5, 40, 70, 80, 85, 92, 99]) for (const bp of [52, 88, 120, 141, 145]) {
          const d = { id: "s1", type, a: { t: times[ab], p: ap }, b: { t: times[bb], p: bp } };
          if (type === "channel") d.off = 6;
          T2.drawsLoad([d]);
          const G = T2.drawsGeo();
          const A = { x: G.fiToX(ab), y: G.pToY(ap) }, B = { x: G.fiToX(bb), y: G.pToY(bp) };
          const mid = (type === "trend" || type === "channel")
            ? { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 }
            : { x: (A.x + B.x) / 2, y: Math.max(A.y, B.y) };
          T2.drawsPointerDown({}, mid.x, mid.y); T2.drawsPointerUp();
          const sw = T2._swatchRects(G, d), badge = T2._delBadge(G, d);
          if (!sw.length || !badge) continue;
          checked++;
          for (const r of sw) {
            for (const P of [A, B])
              assert.ok(!rectHitsCircle(r, P.x, P.y, HR_VIS_),
                type + " 스와치가 핸들 링을 덮었다 — a=" + ab + "/" + ap + " b=" + bb + "/" + bp + " " + JSON.stringify(r));
            assert.ok(!rectHitsCircle(r, badge.x, badge.y, badge.r + 2),
              type + " 스와치가 ✕ 배지 히트원과 겹쳤다(파괴적) — " + JSON.stringify(r));
          }
        }
    assert.ok(checked > 2500, "격자가 실제로 돌았는지 — 검사한 구성 수: " + checked);
  });
  T2.drawsLoad([]); T2._undoReset();
});

test("FINAL M-9 회귀: hline·vline 본체 밴드 위 클릭은 body — 스와치가 선 밑에 깔리면 안 됨", () => {
  const T2 = require("./forge-tools.js");
  withRecShim(({ times }) => {
    for (const p of [149, 140, 128, 120, 100, 80, 60, 51]) {
      const d = { id: "h1", type: "hline", a: { t: times[10], p } };
      T2.drawsLoad([d]);
      const G = T2.drawsGeo();
      const y = G.pToY(p);
      T2.drawsPointerDown({}, 300, y); T2.drawsPointerUp();   // 선택
      const badge = T2._delBadge(G, d);
      assert.ok(T2._swatchRects(G, d).length, "p=" + p + ": 선택 상태여야 유효한 검사");
      for (let x = G.g.padX + 2; x <= G.g.plotRight - 2; x += 11)
        for (const dy of [-BODY_R_ + 0.1, -2, 0, 2, BODY_R_ - 0.1]) {
          const qy = y + dy;
          if (qy < G.g.padTop || qy > G.g.ch - G.g.padBot) continue;
          if (badge && Math.hypot(x - badge.x, qy - badge.y) <= badge.r + 2) continue;   // 배지는 선 위에 얹히는 게 의도
          const h = T2.drawsHitTest(x, qy);
          assert.ok(h && h.kind === "body",
            "hline p=" + p + " 의 선 위(" + x.toFixed(0) + "," + qy.toFixed(1) + ") 클릭이 " + (h ? h.kind : "null") + " 로 먹혔다");
        }
    }
    for (const bar of [0, 1, 20, 50, 80, 98, 99]) {
      const d = { id: "v1", type: "vline", a: { t: times[bar], p: 100 } };
      T2.drawsLoad([d]);
      const G = T2.drawsGeo();
      const x = G.fiToX(bar);
      T2.drawsPointerDown({}, x, 200); T2.drawsPointerUp();
      const badge = T2._delBadge(G, d);
      for (let qy = G.g.padTop + 2; qy <= G.g.ch - G.g.padBot - 2; qy += 9)
        for (const dx of [-BODY_R_ + 0.1, 0, BODY_R_ - 0.1]) {
          const qx = x + dx;
          if (qx < G.g.padX - 2 || qx > G.g.plotRight + 2) continue;
          if (badge && Math.hypot(qx - badge.x, qy - badge.y) <= badge.r + 2) continue;
          const h = T2.drawsHitTest(qx, qy);
          assert.ok(h && h.kind === "body",
            "vline bar=" + bar + " 의 선 위(" + qx.toFixed(0) + "," + qy + ") 클릭이 " + (h ? h.kind : "null") + " 로 먹혔다");
        }
    }
  });
  T2.drawsLoad([]); T2._undoReset();
});

test("FINAL I-2 회귀: 사용자가 고른 굵기가 **페인트**까지 간다(6종 전부·CW 3단)", () => {
  const T2 = require("./forge-tools.js");
  withRecShim(({ times, ctx }) => {
    // 이 계열의 함정: drawStyle() 반환값만 단언하면 페인트에서 굵기를 흘려도 통과한다
    // (Task 4 가 그렇게 장식 스와치를 출하했다). 여기선 stroke() 시점의 lineWidth 만 본다.
    for (const w of T2.SW_W) {
      T2.drawsLoad([
        { id: "t1", type: "trend",   color: "#123456", w, a: { t: times[10], p: 90 },  b: { t: times[40], p: 120 } },
        { id: "c1", type: "channel", color: "#123456", w, off: 8, a: { t: times[50], p: 95 }, b: { t: times[80], p: 130 } },
        { id: "r1", type: "range",   color: "#123456", w, a: { t: times[90], p: 100 }, b: { t: times[110], p: 120 } },
        { id: "p1", type: "period",  color: "#123456", w, a: { t: times[112], p: 60 }, b: { t: times[130], p: 80 } },
        { id: "h1", type: "hline",   color: "#123456", w, a: { t: times[10], p: 110 } },
        { id: "v1", type: "vline",   color: "#123456", w, a: { t: times[60], p: 100 } },
      ]);
      ctx.ops.length = 0; T2.drawsRender();
      const body = ctx.ops.filter(o => o.op === "stroke" && o.color === "#123456");
      assert.strictEqual(body.length, 7,
        w + ": 6종 7획(추세1·채널2·박스2·hline1·vline1)이 나와야 함: " + body.length);
      assert.ok(body.every(o => o.lineWidth === CW_[w]),
        w + " 를 골랐는데 페인트 굵기가 CW." + w + "(" + CW_[w] + ") 가 아니다: " + JSON.stringify(body.map(o => o.lineWidth)));
    }
    // 굵기 스와치 클릭 → 페인트까지 반영되는 왕복도 함께(저장값 단언만으로는 부족)
    const d = { id: "h1", type: "hline", color: "#123456", a: { t: times[10], p: 100 } };
    T2.drawsLoad([d]);
    const G = T2.drawsGeo();
    T2.drawsPointerDown({}, 300, G.pToY(100)); T2.drawsPointerUp();
    const bold = T2._swatchRects(G, d).find(r => r.kind === "w" && r.val === "bold");
    assert.ok(bold, "bold 스와치가 있어야 함");
    T2.drawsPointerDown({}, bold.x + bold.w / 2, bold.y + bold.h / 2);
    ctx.ops.length = 0; T2.drawsRender();
    const line = ctx.ops.filter(o => o.op === "stroke" && o.color === "#123456" && o.alpha < 1 && o.dash.length);
    assert.ok(line.length && line.every(o => o.lineWidth === CW_.bold),
      "스와치로 고른 bold 가 실제 선 굵기로 안 갔다: " + JSON.stringify(line.map(o => o.lineWidth)));
  });
  T2.drawsLoad([]); T2._undoReset();
});

test("FINAL 잔여: 굵기 스와치 칸의 획도 현재 도형 색으로 그린다(패널 색 페인트 단언)", () => {
  const T2 = require("./forge-tools.js");
  withRecShim(({ times, ctx }) => {
    const { mid } = seedTrend(T2, times, "#123456");
    T2.drawsPointerDown({}, mid.x, mid.y); T2.drawsPointerUp();
    T2.drawsCursor(60, 30);   // 호버 해제 — 핸들이 색으로 차면 획 수가 달라진다
    ctx.ops.length = 0; T2.drawsRender();
    const cw = ctx.ops.filter(o => o.op === "stroke" && o.alpha === 1 && o.color === "#123456").map(o => o.lineWidth);
    for (const k of T2.SW_W)
      assert.ok(cw.includes(CW_[k]),
        "굵기 칸 " + k + "(" + CW_[k] + ") 획이 도형 색으로 안 그려졌다 — 타입 기본색으로 그리면 여기서 잡힌다: " + JSON.stringify(cw));
  });
  T2.drawsLoad([]); T2._undoReset();
});

test("FINAL 잔여: 진행 칩 글자색·라벨 배경도 테마 전역을 그릴 때 읽는다", () => {
  const T2 = require("./forge-tools.js");
  withRecShim(({ times, ctx }) => {
    const pg = global.FC_GOLD, pb = global.FC_CHART_BG;
    global.FC_GOLD = "#3a4656";      // daylight — _syncChartColors() 가 하는 재대입
    global.FC_CHART_BG = "#ffffff";
    try {
      T2.drawsLoad([{ id: "t1", type: "trend", color: "#123456", a: { t: times[10], p: 90 }, b: { t: times[40], p: 120 } }]);
      T2.drawsArm("trend");          // 진행 칩은 무장 상태에서만 그려진다
      ctx.ops.length = 0; T2.drawsRender();
      const chip = ctx.ops.filter(o => o.op === "text" && /시작점/.test(o.text))[0];
      assert.ok(chip, "무장 중에는 진행 칩이 그려져야 함");
      assert.strictEqual(chip.color, "#3a4656",
        "칩 글자색이 리터럴 골드면 흰 배경에서 안 읽힌다: " + chip.color);
      assert.ok(ctx.ops.some(o => o.op === "fill" && o.style === "rgba(255,255,255,.86)"),
        "라벨·칩 배경이 --chart-bg 를 따라야 함(리터럴 검정이면 흰 차트 위에 검은 박스): "
        + JSON.stringify([...new Set(ctx.ops.filter(o => o.op === "fill").map(o => o.style))]));
    } finally {
      T2.drawsArm(null);
      if (pg === undefined) delete global.FC_GOLD; else global.FC_GOLD = pg;
      if (pb === undefined) delete global.FC_CHART_BG; else global.FC_CHART_BG = pb;
    }
  });
  T2.drawsLoad([]); T2._undoReset();
});

/* ══ I-3: 컨트롤 뭉치 근접 배치 ═══════════════════════════════════════════════════
   I-1 라운드가 세운 "후보를 훑어 처음 깨끗한 곳"은 **안전하지만 가깝지는 않았다** —
   후보가 넷뿐이라 겨우 2.3px 걸친 핸들 하나 때문에 줄이 205px 아래로 뛰었다.
   아래 두 테스트는 그 근접성 계약을 지킨다(안전성은 위 I-1·M-9 테스트가 계속 지킨다).
   _swatchRects 내부 상수와 같은 값(비노출) — 어긋나면 아래 후보 재현이 먼저 깨진다. */
const SW_S_ = 12, SW_CLR_ = 6.5;

/* geometry 를 인자로 받는 셰임 — I-3 재현 조건(낮은 차트 ch 340 · 150봉)은
   withChartShim/withRecShim 의 고정 격자에서는 재현되지 않는다. */
function withGeoShim(g, fn) {
  const times = [];
  { const base = Date.parse("2026-01-01T00:00:00Z"); for (let i = 0; i < 150; i++) times.push(new Date(base + i * 86400000).toISOString().slice(0, 10)); }
  function makeCtx() {
    const t = {};
    return new Proxy(t, {
      get(o, p) {
        if (p in o) return o[p];
        if (p === "measureText") return s => ({ width: String(s || "").length * 7 });
        // 채널 면 채우기(_fadeFill)는 반환값의 addColorStop 을 부른다 — 프록시 기본 no-op 로는 못 받는다.
        if (p === "createLinearGradient") return () => ({ addColorStop() {} });
        return function () {};
      },
      set(o, p, v) { o[p] = v; return true; }
    });
  }
  const mk = extra => Object.assign({ style: {}, width: 0, height: 0, parentElement: { clientWidth: 800, clientHeight: 450 }, getContext: () => makeCtx() }, extra || {});
  const mainCanvas = mk({ _mainGeo: g }), drawsCanvas = mk({});
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

/* 선택 상태는 반드시 실제 본체 클릭으로 만든다 — 미선택 상태에선 스와치가 아예 안 나오고,
   _selId 를 우회해 넣으면 판정 경로가 오염된다(스윕 스크립트와 같은 관례). */
function selectByBody(T2, d, G, times) {
  const A = { x: G.fiToX(T2.tToFi(times, d.a.t)), y: G.pToY(d.a.p) };
  const B = d.b ? { x: G.fiToX(T2.tToFi(times, d.b.t)), y: G.pToY(d.b.p) } : null;
  T2.drawsLoad([d]);
  let pick;
  if (d.type === "hline") pick = { x: (G.g.padX + G.g.plotRight) / 2, y: A.y };
  else if (d.type === "vline") pick = { x: A.x, y: (G.g.padTop + G.g.ch - G.g.padBot) / 2 };
  else if (d.type === "trend" || d.type === "channel") pick = { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 };
  else pick = { x: (A.x + B.x) / 2, y: Math.max(A.y, B.y) };
  if (!isFinite(pick.x) || !isFinite(pick.y)) return null;
  const h0 = T2.drawsHitTest(pick.x, pick.y);
  if (!h0 || h0.kind !== "body") return null;
  T2.drawsPointerDown({}, pick.x, pick.y); T2.drawsPointerUp();
  return { A, B };
}

/* _swatchRects 의 후보 목록·회피 영역을 **테스트 쪽에서 독립적으로 다시 세운다**.
   구현을 그대로 부르면 "고른 것이 고른 것과 같다"는 무의미검사가 된다 — 여기서 검증하려는
   것은 목록 자체가 아니라 **거리순으로 골랐는가** 이므로, 목록은 사양대로 재현하고
   순서만 오라클이 정한다. */
function swatchCandidates(T2, G, d, db, rowW, times) {
  const S = SW_S_, SEP = db.r + 6;
  const pt = a => ({ x: G.fiToX(T2.tToFi(times, a.t)), y: G.pToY(a.p) });
  const isLine = (d.type === "hline" || d.type === "vline");
  let P = isLine ? [] : ["a", "b"].filter(k => d[k]).map(k => pt(d[k])).filter(p => isFinite(p.x) && isFinite(p.y));
  if (!P.length) { const a = pt(d.a); if (isFinite(a.x) && isFinite(a.y)) P = [a]; }
  if (!P.length) P = [{ x: db.x, y: db.y }];
  const minX = Math.min(...P.map(p => p.x)), maxX = Math.max(...P.map(p => p.x));
  const minY = Math.min(...P.map(p => p.y)), maxY = Math.max(...P.map(p => p.y));
  const yDef = db.y + SEP;
  const ys = [yDef, db.y - SEP - S, maxY + SW_CLR_, minY - SW_CLR_ - S];
  for (const h of P) ys.push(h.y + SW_CLR_, h.y - SW_CLR_ - S);
  const zones = [{ x: db.x, y: db.y, r: db.r + 2 }];
  if (d.type === "hline") {
    const y = G.pToY(d.a.p);
    if (isFinite(y)) zones.push({ rx: G.g.padX, ry: y - BODY_R_, rw: G.g.plotRight - G.g.padX, rh: BODY_R_ * 2 });
  } else if (d.type === "vline") {
    const x = G.fiToX(T2.tToFi(times, d.a.t));
    if (isFinite(x)) zones.push({ rx: x - BODY_R_, ry: G.g.padTop, rw: BODY_R_ * 2, rh: G.g.ch - G.g.padTop - G.g.padBot });
  } else for (const h of P) zones.push({ x: h.x, y: h.y, r: SW_CLR_ });
  return {
    yDef, ys, zones, S,
    near: [db.x - db.r, maxX + SW_CLR_ + 2, G.g.plotRight + 2 - rowW],
    far: [minX - SW_CLR_ - 2 - rowW, G.g.padX - 2],
  };
}
function rowClearOracle(x0, y0, w, h, zones, G) {
  if (!isFinite(x0) || !isFinite(y0)) return false;
  if (x0 < G.g.padX - 2 || x0 + w > G.g.plotRight + 2) return false;
  if (y0 < G.g.padTop || y0 + h > G.g.ch - G.g.padBot) return false;
  for (const z of zones) {
    if (z.r !== undefined) {
      const nx = Math.max(x0, Math.min(z.x, x0 + w)), ny = Math.max(y0, Math.min(z.y, y0 + h));
      if (Math.hypot(z.x - nx, z.y - ny) < z.r) return false;
    } else if (x0 < z.rx + z.rw && z.rx < x0 + w && y0 < z.ry + z.rh && z.ry < y0 + h) return false;
  }
  return true;
}
/* 근거리 x 묶음을 먼저 소진하는 구현의 계약을 그대로 반영한다 — 그 묶음 안에 통과 가능한
   y 가 하나라도 있으면 원거리로 넘어가지 않는다. */
function nearestClearY(c, rowW, G) {
  for (const xs of [c.near, c.far]) {
    const ok = c.ys.filter(y => xs.some(x => rowClearOracle(x, y, rowW, c.S, c.zones, G)));
    if (ok.length) return ok.reduce((a, b) => (Math.abs(b - c.yDef) < Math.abs(a - c.yDef) ? b : a));
  }
  return null;
}

test("I-3 회귀: 스와치 줄이 ✕ 배지에 붙어 있다 — 2.3px 걸침 때문에 205px 아래로 뛰지 않는다", () => {
  const T2 = require("./forge-tools.js");
  /* 재현 조건: 차트가 낮고(ch 340) 오른쪽 위로 뻗은 추세선. 끝점 b 가 기본 자리(배지 아래)를
     2.3px 만 물어서, 성긴 후보 넷만 있던 시절엔 "모든 핸들 아래"(y 251.46 — 반대쪽 핸들 옆)가
     첫 통과 자리였다. 배지는 y 31 이므로 220.46px 아래, 즉 컨트롤 뭉치가 도형과 분리됐다. */
  withGeoShim({ padX: 40, padTop: 20, padBot: 24, ch: 340, histW: 520, plotRight: 600, start: 0, count: 150, log: false, loV: 80, hiV: 130 }, ({ times }) => {
    const d = { id: "i3", type: "trend", a: { t: times[95], p: 92 }, b: { t: times[146], p: 126 } };
    const G = T2.drawsGeo();
    const pts = selectByBody(T2, d, G, times);
    assert.ok(pts, "본체 클릭으로 선택돼야 유효한 검사");
    const db = T2._delBadge(G, d), sw = T2._swatchRects(G, d);
    assert.ok(db && sw.length, "선택 상태여야 배지·스와치가 나온다");
    const dy = Math.abs(sw[0].y - db.y);
    /* 임계 40px 의 근거: 기본 자리는 배지 중심에서 SEP(=db.r+6=15) 아래이고 줄 높이는 12 —
       뭉치 전체가 27px 안에 든다. 장애물 하나를 비켜가느라 한 칸 더 밀리는 것까지는 같은
       뭉치로 읽히지만(≈40), 그 이상은 도형과 무관한 별개 UI 로 보인다. 회귀 전 220.46 은
       이 임계의 5배가 넘는다. 지금 값은 19.18(핸들 b 링을 막 벗어난 자리). */
    assert.ok(dy <= 40, "스와치 줄이 ✕ 배지에서 " + dy.toFixed(2) + "px 떨어졌다(임계 40) — 컨트롤 뭉치가 도형에서 분리됐다");
    // 가까워졌다고 안전을 잃으면 안 된다 — I-1·Task 4 불변식을 이 자리에서도 직접 단언한다.
    for (const r of sw) {
      assert.ok(!rectHitsCircle(r, db.x, db.y, db.r + 2), "Task 4 불변식 위반(스와치 ∩ ✕ 배지 히트원) — " + JSON.stringify(r));
      for (const [P, k] of [[pts.A, "a"], [pts.B, "b"]])
        assert.ok(!rectHitsCircle(r, P.x, P.y, SW_CLR_), k + " 핸들 회피 반경(SW_CLR)을 침범했다 — " + JSON.stringify(r));
    }
  });
  T2.drawsLoad([]); T2._undoReset();
});

test("I-3 일반: 고른 y 는 항상 '기본 자리에서 가장 가까운 안전한 후보' 다(3 geometry × 6종 격자)", () => {
  const T2 = require("./forge-tools.js");
  const GEOS = [
    { padX: 50, padTop: 20, padBot: 30, ch: 400, histW: 600, plotRight: 650, start: 0, count: 100, log: false, loV: 50,  hiV: 150 },
    { padX: 40, padTop: 20, padBot: 24, ch: 340, histW: 520, plotRight: 600, start: 0, count: 150, log: false, loV: 80,  hiV: 130 },
    { padX: 60, padTop: 16, padBot: 40, ch: 300, histW: 700, plotRight: 760, start: 0, count: 80,  log: false, loV: 900, hiV: 1100 },
  ];
  let checked = 0, fallback = 0, worst = 0;
  for (const g of GEOS) withGeoShim(g, ({ times }) => {
    const pr = v => g.loV + (g.hiV - g.loV) * v;
    for (const type of ["trend", "channel", "range", "period", "hline", "vline"])
      for (const ab of [0, 18, 47, 71, 88]) for (const ap of [0.05, 0.31, 0.56, 0.8, 0.96])
        for (const bb of [9, 33, 60, 84, 96]) for (const bp of [0.1, 0.42, 0.68, 0.93]) {
          const d = { id: "gx", type, a: { t: times[ab], p: pr(ap) } };
          if (type !== "hline" && type !== "vline") d.b = { t: times[bb], p: pr(bp) };
          if (type === "channel") d.off = (g.hiV - g.loV) * 0.06;
          const G = T2.drawsGeo();
          if (!selectByBody(T2, d, G, times)) continue;
          const db = T2._delBadge(G, d), sw = T2._swatchRects(G, d);
          if (!db || !sw.length) continue;
          const last = sw[sw.length - 1];
          const rowW = last.x + last.w - sw[0].x;
          const c = swatchCandidates(T2, G, d, db, rowW, times);
          const best = nearestClearY(c, rowW, G);
          // 후보가 전부 막히면 최후 수단(옛 클램프) 분기 — 근접성 계약의 대상이 아니다.
          if (best === null) { fallback++; continue; }
          checked++;
          const got = Math.abs(sw[0].y - c.yDef), want = Math.abs(best - c.yDef);
          worst = Math.max(worst, got - want);
          assert.ok(got <= want + 1e-9,
            type + " a=" + ab + "/" + ap + " b=" + bb + "/" + bp + " ch=" + g.ch
            + " : 기본 자리에서 " + got.toFixed(2) + "px 떨어진 자리를 골랐는데, "
            + want.toFixed(2) + "px 짜리 안전한 후보가 있었다(y " + sw[0].y.toFixed(2) + " vs " + best.toFixed(2) + ")");
        }
  });
  assert.ok(checked > 3000, "격자가 실제로 돌았는지 — 검사한 구성 수: " + checked);
  assert.strictEqual(fallback, 0, "최후 수단 분기 도달 " + fallback + "건 — 후보 목록이 비면 안 된다");
  assert.strictEqual(worst, 0, "구현이 오라클보다 먼 자리를 고른 최대 초과: " + worst);
});

/* ══ 완성하면 도구가 풀린다 (2026-08-07) ═════════════════════════════════════════
   앞선 라운드의 "연속 그리기"(완성해도 _armed 유지)를 사용자가 써 보고 뒤집은 결정이다 —
   무장이 안 풀리면 차트 위 모든 클릭이 drawsPointerDown 의 _armed 분기(히트테스트보다
   앞선다)에 삼켜져 **이미 그린 도형을 마우스로 선택·수정할 수가 없었다**.
   새 계약: ① 도형을 완성하면 무장 해제 + 그 도형이 선택 상태 ② 그리다 만 도형을
   취소(Esc·같은 자리 재클릭)하면 도구는 그대로 남는다(바로 다시 시도).
   아래 테스트가 그 두 계약을 도형 종류별로 고정한다 — 연속 그리기를 되살리면 전부 빨개진다. */

/* 클릭식 두 앵커 도구(trend·range·period) 한 벌 그리기 — 트레이딩뷰식 클릭·클릭. */
function drawTwoClick(T2, type, x1, y1, x2, y2) {
  T2.drawsArm(type);
  assert.strictEqual(T2.drawsPointerDown({}, x1, y1), true, type + " 1번째 클릭이 소비되어야 함");
  T2.drawsPointerUp();          // 같은 자리 → stage2(끝점 대기)
  assert.strictEqual(T2.drawsPointerDown({}, x2, y2), true, type + " 2번째 클릭이 소비되어야 함");
  T2.drawsPointerUp();          // _drag 는 이미 풀렸으므로 no-op (계약 확인용으로 같이 호출)
  return T2.drawsAll()[T2.drawsAll().length - 1];
}

/* 완성된 도형의 "본체"만 확실히 눌리는 좌표 — 선택 중에는 핸들·✕배지·스와치가 같이 떠 있어
   끝점 근처를 누르면 body 가 아닌 다른 판정이 이긴다. 판정 결과를 단언해 좌표 선택 실수를
   테스트 실패로 드러낸다(no-new-drawing 단언만 있으면 스와치를 눌러도 통과해버린다). */
function assertBodyHit(T2, x, y, msg) {
  const h = T2.drawsHitTest(x, y);
  assert.ok(h && h.kind === "body", msg + " — 본체로 잡혀야 함(실제: " + JSON.stringify(h) + ")");
}

test("완성 해제: hline 1클릭 완성 → 무장 풀림 + 그 선이 선택됨", () => {
  const T2 = require("./forge-tools.js");
  withChartShim(() => {
    T2.drawsLoad([]); T2._undoReset();
    T2.drawsArm("hline");
    const G = T2.drawsGeo();
    T2.drawsPointerDown({}, 300, G.pToY(90));
    assert.strictEqual(T2.drawsArmed(), false, "완성했으면 도구가 풀려야 함(연속 그리기 되살아남)");
    assert.strictEqual(T2._selectedId(), T2.drawsAll()[0].id, "완성된 선이 선택 상태여야 함");
  });
  T2.drawsLoad([]); T2._undoReset();
});

test("완성 해제: vline 1클릭 완성 → 무장 풀림 + 그 선이 선택됨", () => {
  const T2 = require("./forge-tools.js");
  withChartShim(() => {
    T2.drawsLoad([]); T2._undoReset();
    T2.drawsArm("vline");
    const G = T2.drawsGeo();
    T2.drawsPointerDown({}, G.fiToX(40), 200);
    assert.strictEqual(T2.drawsArmed(), false, "완성했으면 도구가 풀려야 함");
    assert.strictEqual(T2._selectedId(), T2.drawsAll()[0].id, "완성된 선이 선택 상태여야 함");
  });
  T2.drawsLoad([]); T2._undoReset();
});

test("완성 해제: hline 완성 후 그 선을 다시 클릭 — 새 그림이 안 생기고 선택이 유지된다", () => {
  const T2 = require("./forge-tools.js");
  withChartShim(() => {
    T2.drawsLoad([]); T2._undoReset();
    T2.drawsArm("hline");
    const G = T2.drawsGeo();
    const y = G.pToY(90);
    T2.drawsPointerDown({}, 300, y);
    const id = T2.drawsAll()[0].id;
    // 본체 클릭 — 무장이 남아 있으면 이 클릭이 _armed 분기에 삼켜져 hline 이 하나 더 생긴다(사용자가 겪은 증상).
    assertBodyHit(T2, 500, y, "이미 그린 hline 위 클릭");
    T2.drawsPointerDown({}, 500, y);
    T2.drawsPointerUp();
    assert.strictEqual(T2.drawsAll().length, 1, "기존 그림 위를 클릭했는데 새 그림이 생기면 안 됨");
    assert.strictEqual(T2._selectedId(), id, "그 그림이 선택 상태로 남아야 함(마우스로 수정 가능)");
  });
  T2.drawsLoad([]); T2._undoReset();
});

test("완성 해제: vline 완성 후 그 선을 다시 클릭 — 새 그림이 안 생기고 선택이 유지된다", () => {
  const T2 = require("./forge-tools.js");
  withChartShim(() => {
    T2.drawsLoad([]); T2._undoReset();
    T2.drawsArm("vline");
    const G = T2.drawsGeo();
    const x = G.fiToX(40);
    T2.drawsPointerDown({}, x, 200);
    const id = T2.drawsAll()[0].id;
    assertBodyHit(T2, x, 320, "이미 그린 vline 위 클릭");
    T2.drawsPointerDown({}, x, 320);
    T2.drawsPointerUp();
    assert.strictEqual(T2.drawsAll().length, 1, "기존 그림 위를 클릭했는데 새 그림이 생기면 안 됨");
    assert.strictEqual(T2._selectedId(), id, "그 그림이 선택 상태로 남아야 함");
  });
  T2.drawsLoad([]); T2._undoReset();
});

test("완성 해제: 클릭식 2앵커 도구(trend·range·period) — 완성 시 해제·선택, 재클릭은 선택만", () => {
  const T2 = require("./forge-tools.js");
  withChartShim(() => {
    for (const type of ["trend", "range", "period"]) {
      T2.drawsLoad([]); T2._undoReset();
      const G = T2.drawsGeo();
      const y1 = G.pToY(95), y2 = G.pToY(115);
      const d = drawTwoClick(T2, type, 150, y1, 550, y2);
      assert.strictEqual(T2.drawsAll().length, 1, type + " 그림 1개가 완성돼야 함");
      assert.strictEqual(T2.drawsArmed(), false, type + ": 완성했으면 도구가 풀려야 함");
      assert.strictEqual(T2._selectedId(), d.id, type + ": 완성된 도형이 선택 상태여야 함");

      // 본체 위 재클릭 — trend 는 선의 중점, 박스형(range·period)은 아래쪽 변의 중점
      // (위쪽 변은 ✕ 배지·스와치 줄이 뜨는 자리라 판정이 그쪽으로 갈 수 있다).
      const px = 350, py = type === "trend" ? (y1 + y2) / 2 : Math.max(y1, y2);
      assertBodyHit(T2, px, py, type + " 본체 재클릭");
      T2.drawsPointerDown({}, px, py);
      T2.drawsPointerUp();
      assert.strictEqual(T2.drawsAll().length, 1, type + ": 기존 도형 위 클릭으로 새 도형이 생기면 안 됨");
      assert.strictEqual(T2._selectedId(), d.id, type + ": 그 도형이 계속 선택 상태여야 함");
    }
  });
  T2.drawsLoad([]); T2._undoReset();
});

test("완성 해제: 채널 3클릭(시작→끝→폭) — 폭 확정 순간 해제·선택, 재클릭은 선택만", () => {
  const T2 = require("./forge-tools.js");
  withChartShim(() => {
    T2.drawsLoad([]); T2._undoReset();
    T2.drawsArm("channel");
    const G = T2.drawsGeo();
    const y1 = G.pToY(95), y2 = G.pToY(115);
    T2.drawsPointerDown({}, 150, y1);
    T2.drawsPointerMove({}, 550, y2);
    T2.drawsPointerUp();                       // 채널은 여기서 stage2(폭 지정 대기)
    assert.strictEqual(T2.drawsArmed(), true, "폭을 지정하기 전(stage2)에는 아직 그리는 중이어야 함");
    T2.drawsPointerDown({}, 350, G.pToY(130)); // 3번째 클릭 = 폭 확정 → 완성
    const d = T2.drawsAll()[0];
    assert.strictEqual(T2.drawsAll().length, 1, "채널 1개가 완성돼야 함");
    assert.strictEqual(T2.drawsArmed(), false, "폭 확정으로 완성했으면 도구가 풀려야 함");
    assert.strictEqual(T2._selectedId(), d.id, "완성된 채널이 선택 상태여야 함");

    const px = 350, py = (y1 + y2) / 2;        // 기준선 중점
    assertBodyHit(T2, px, py, "채널 기준선 재클릭");
    T2.drawsPointerDown({}, px, py);
    T2.drawsPointerUp();
    assert.strictEqual(T2.drawsAll().length, 1, "기존 채널 위 클릭으로 새 채널이 생기면 안 됨");
    assert.strictEqual(T2._selectedId(), d.id, "그 채널이 계속 선택 상태여야 함");
  });
  T2.drawsLoad([]); T2._undoReset();
});

test("완성 해제: 드래그로 그린 경우(pointerup 완성 경로)도 도구가 풀리고 선택된다", () => {
  const T2 = require("./forge-tools.js");
  withChartShim(() => {
    T2.drawsLoad([]); T2._undoReset();
    T2.drawsArm("trend");
    const G = T2.drawsGeo();
    T2.drawsPointerDown({}, 150, G.pToY(95));
    T2.drawsPointerMove({}, 550, G.pToY(115));   // 6px 이상 이동 = 진짜 드래그
    T2.drawsPointerUp();
    assert.strictEqual(T2.drawsAll().length, 1, "드래그 한 번에 도형 1개");
    assert.strictEqual(T2.drawsArmed(), false, "드래그 완성 경로에서도 도구가 풀려야 함");
    assert.strictEqual(T2._selectedId(), T2.drawsAll()[0].id, "드래그로 그린 도형이 선택 상태여야 함");
  });
  T2.drawsLoad([]); T2._undoReset();
});

test("완성 해제: 완성 뒤 빈 곳 클릭은 새 그림을 만들지 않고 선택만 해제(팬으로 흘러감)", () => {
  const T2 = require("./forge-tools.js");
  withChartShim(() => {
    T2.drawsLoad([]); T2._undoReset();
    T2.drawsArm("hline");
    const G = T2.drawsGeo();
    T2.drawsPointerDown({}, 300, G.pToY(90));
    const r = T2.drawsPointerDown({}, 300, G.pToY(140));   // 선에서 먼 빈 자리
    assert.strictEqual(T2.drawsAll().length, 1, "빈 곳 클릭으로 새 그림이 생기면 안 됨");
    assert.strictEqual(r, false, "빈 곳 클릭은 소비하지 않아야 팬이 막히지 않음");
    assert.strictEqual(T2._selectedId(), null, "빈 곳 클릭은 선택 해제");
  });
  T2.drawsLoad([]); T2._undoReset();
});

test("취소는 무장 유지: 같은 자리 재클릭(<6px)으로 접으면 도구가 남아 바로 다시 그릴 수 있다", () => {
  const T2 = require("./forge-tools.js");
  withChartShim(() => {
    T2.drawsLoad([]); T2._undoReset();
    T2.drawsArm("trend");
    const G = T2.drawsGeo();
    const y = G.pToY(95);
    T2.drawsPointerDown({}, 300, y);
    T2.drawsPointerUp();                 // stage2
    // 같은 자리(<6px) → 0길이라 취소. x 는 그대로 둔다 — 봉 간격이 6px 라 한 봉만 어긋나도
    // 판정 경계(6px)를 넘어 "완성"으로 흘러간다(앵커가 봉 단위로 반올림되기 때문).
    T2.drawsPointerDown({}, 300, y + 2);
    assert.strictEqual(T2.drawsAll().length, 0, "0길이 도형은 남지 않아야 함");
    assert.strictEqual(T2.drawsArmed(), true, "취소는 완성이 아니다 — 도구가 그대로 남아야 함");
    // 남은 무장으로 곧바로 다시 그릴 수 있어야 한다.
    T2.drawsPointerDown({}, 150, y);
    T2.drawsPointerUp();
    T2.drawsPointerDown({}, 550, G.pToY(115));
    assert.strictEqual(T2.drawsAll().length, 1, "취소 직후 재시도가 바로 그려져야 함");
    assert.strictEqual(T2.drawsArmed(), false, "재시도가 완성됐으면 이번엔 풀려야 함");
  });
  T2.drawsLoad([]); T2._undoReset();
});

test("취소는 무장 유지: 그리는 도중 Esc 는 도형만 접고 도구는 남긴다(두 번째 Esc 가 도구 해제)", () => {
  const T2 = require("./forge-tools.js");
  withChartShim(() => {
    T2.drawsLoad([]); T2._undoReset();
    T2.drawsArm("range");
    const G = T2.drawsGeo();
    T2.drawsPointerDown({}, 200, G.pToY(95));
    T2.drawsPointerUp();                 // stage2 = 끝점 대기
    assert.strictEqual(T2.drawsKey({ key: "Escape" }), true, "Esc 가 소비되어야 함");
    assert.strictEqual(T2.drawsAll().length, 0, "그리다 만 도형은 사라져야 함");
    assert.strictEqual(T2.drawsArmed(), true, "첫 Esc 는 도형만 접는다 — 도구는 유지");
    assert.strictEqual(T2.drawsKey({ key: "Escape" }), true, "두 번째 Esc 도 소비");
    assert.strictEqual(T2.drawsArmed(), false, "두 번째 Esc 가 도구를 푼다");
  });
  T2.drawsLoad([]); T2._undoReset();
});

test("도구 버튼 토글: 활성 도구를 다시 누르면 해제된다(취소가 _armed 를 건드리면 재무장으로 뒤집힘)", () => {
  const T2 = require("./forge-tools.js");
  withChartShim(() => {
    T2.drawsLoad([]); T2._undoReset();
    T2.drawsArm("trend");
    assert.strictEqual(T2.drawsArmed(), true);
    T2.drawsArm("trend");
    assert.strictEqual(T2.drawsArmed(), false, "같은 도구 재클릭 = 토글 해제");
    // 그리다 만 상태(stage2)에서 같은 도구를 다시 눌러도 토글 해제여야 한다 —
    // _cancelNew 가 _armed 까지 지우면 drawsArm 의 `_armed === type` 판정이 어긋나 재무장이 된다.
    T2.drawsArm("trend");
    const G = T2.drawsGeo();
    T2.drawsPointerDown({}, 200, G.pToY(95));
    T2.drawsPointerUp();
    T2.drawsArm("trend");
    assert.strictEqual(T2.drawsArmed(), false, "그리다 만 상태에서도 같은 도구 재클릭은 해제여야 함");
    assert.strictEqual(T2.drawsAll().length, 0, "그리다 만 도형은 같이 정리돼야 함");
  });
  T2.drawsLoad([]); T2._undoReset();
});
