import { test } from "node:test";
import assert from "node:assert";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const M = require("../www/watchlist-model.js");

const LIST = [
  { sym: "NVDA", name: "NVIDIA Corporation" },
  { sym: "AAPL", name: "Apple Inc." },
  { sym: "005930", name: "Samsung Electronics" },
  { sym: "SPY", name: "S&P 500 ETF" }
];

test("market — 6자리 숫자는 한국 종목", () => {
  assert.strictEqual(M.market("005930"), "KR");
  assert.strictEqual(M.market("000660"), "KR");
});

test("market — 알려진 ETF 는 ETF, 대소문자 무관", () => {
  assert.strictEqual(M.market("SPY"), "ETF");
  assert.strictEqual(M.market("spy"), "ETF");
  assert.strictEqual(M.market("QQQ"), "ETF");
});

test("market — 나머지는 US", () => {
  assert.strictEqual(M.market("NVDA"), "US");
  assert.strictEqual(M.market("BRK.B"), "US");
});

test("market — 빈 값·null 에 죽지 않는다", () => {
  for (const bad of ["", null, undefined, "   "]) {
    assert.strictEqual(M.market(bad), "US", "입력 " + bad);
  }
});

test("chips — All 이 첫 번째이고 전체 개수를 갖는다", () => {
  const c = M.chips(LIST);
  assert.strictEqual(c[0].key, "all");
  assert.strictEqual(c[0].count, 4);
});

test("chips — 보유한 시장만 칩이 된다", () => {
  const c = M.chips(LIST);
  assert.deepEqual(c.map(x => x.key), ["all", "US", "KR", "ETF"]);
  const onlyUs = M.chips([{ sym: "NVDA", name: "NVIDIA" }, { sym: "AAPL", name: "Apple" }]);
  assert.deepEqual(onlyUs.map(x => x.key), ["all", "US"], "없는 시장 칩이 생겼다");
});

test("chips — 빈 목록이면 All 하나(개수 0)", () => {
  const c = M.chips([]);
  assert.deepEqual(c.map(x => x.key), ["all"]);
  assert.strictEqual(c[0].count, 0);
});

test("filter — 칩만 적용", () => {
  assert.deepEqual(M.filter(LIST, { chip: "KR" }).map(x => x.sym), ["005930"]);
  assert.deepEqual(M.filter(LIST, { chip: "ETF" }).map(x => x.sym), ["SPY"]);
  assert.strictEqual(M.filter(LIST, { chip: "all" }).length, 4);
});

test("filter — 검색은 심볼과 회사명 둘 다, 대소문자 무시", () => {
  assert.deepEqual(M.filter(LIST, { query: "nvd" }).map(x => x.sym), ["NVDA"]);
  assert.deepEqual(M.filter(LIST, { query: "samsung" }).map(x => x.sym), ["005930"]);
  assert.deepEqual(M.filter(LIST, { query: "APPLE" }).map(x => x.sym), ["AAPL"]);
});

test("filter — 검색어가 공백뿐이면 전체", () => {
  assert.strictEqual(M.filter(LIST, { query: "   " }).length, 4);
  assert.strictEqual(M.filter(LIST, {}).length, 4);
  assert.strictEqual(M.filter(LIST, null).length, 4);
});

test("filter — 칩과 검색을 함께", () => {
  assert.deepEqual(M.filter(LIST, { chip: "US", query: "a" }).map(x => x.sym), ["NVDA", "AAPL"]);
});

test("filter — 목록에 없는 시장의 칩이면 All 로 떨어진다", () => {
  // 마지막 KR 종목을 지운 직후 KR 칩이 활성인 상태. 빈 화면 대신 전체를 보여준다.
  const noKr = [{ sym: "NVDA", name: "NVIDIA" }, { sym: "SPY", name: "S&P 500 ETF" }];
  assert.strictEqual(M.filter(noKr, { chip: "KR" }).length, 2);
});

test("badge — 방향 있는 레코드는 conf 를 쓰고 없으면 null(옛 스캔 레코드·미스캔)", () => {
  assert.strictEqual(M.badge(null), null);
  assert.strictEqual(M.badge({}), null);
  assert.strictEqual(M.badge({ conf: null, dir: "bull" }), null);
  assert.strictEqual(M.badge({ conf: NaN, dir: "bull" }), null);
});

test("badge — 퍼센트 문자열과 방향 tone", () => {
  assert.deepEqual(M.badge({ conf: 68, dir: "bull" }), { text: "68%", tone: "bull" });
  assert.deepEqual(M.badge({ conf: 46.4, dir: "bear" }), { text: "46%", tone: "bear" });
});

test("badge — 방향 있는 레코드는 conf 를 쓰고 up 은 무시한다", () => {
  assert.deepEqual(M.badge({ conf: 68, up: 55, dir: "bull" }), { text: "68%", tone: "bull" });
});

test("badge — 중립 레코드는 up 을 쓴다", () => {
  assert.deepEqual(M.badge({ conf: null, up: 51, dir: "neutral" }), { text: "51%", tone: "neutral" });
});

test("badge — 중립인데 up 도 없으면 null(옛 스캔 레코드)", () => {
  assert.strictEqual(M.badge({ conf: null, up: null, dir: "neutral" }), null);
  assert.strictEqual(M.badge({ dir: "neutral" }), null);
});

test("badge — 방향은 있는데 conf 가 없으면 null", () => {
  assert.strictEqual(M.badge({ conf: null, up: 55, dir: "bull" }), null);
});

// shortName — 74px 이름 칸에 법인 접미사가 들어가면 "NVIDIA Corpo…" 로 잘린다.
// 기대값은 구현 상수가 아니라 실제 API 가 주는 이름과 시안 1a 의 표기에서 가져온다.
test("shortName — 법인 접미사를 뗀다", () => {
  assert.strictEqual(M.shortName("NVIDIA Corporation"), "NVIDIA");
  assert.strictEqual(M.shortName("Apple Inc."), "Apple");
  assert.strictEqual(M.shortName("Microsoft Corporation"), "Microsoft");
  assert.strictEqual(M.shortName("Palantir Technologies Inc."), "Palantir Technologies");
  assert.strictEqual(M.shortName("Alibaba Group Holding Limited"), "Alibaba");
  assert.strictEqual(M.shortName("Sony Group Corporation"), "Sony");
});

test("shortName — 접미사가 아닌 것은 건드리지 않는다", () => {
  assert.strictEqual(M.shortName("SPDR S&P 500 ETF Trust"), "SPDR S&P 500 ETF Trust");
  assert.strictEqual(M.shortName("Samsung Electronics"), "Samsung Electronics");
  // "Global" 은 법인 접미사가 아니라 상호의 일부다 — "Coinbase Global, Inc." 에서 Inc. 만 뗀다.
  assert.strictEqual(M.shortName("Coinbase Global, Inc."), "Coinbase Global");
});

test("shortName — 이름 전체가 접미사면 원본을 지킨다", () => {
  assert.strictEqual(M.shortName("Inc"), "Inc");
  assert.strictEqual(M.shortName("Group"), "Group");
});

test("shortName — 빈 값·비문자열도 문자열을 돌려준다", () => {
  assert.strictEqual(M.shortName(""), "");
  assert.strictEqual(M.shortName(null), "");
  assert.strictEqual(M.shortName(undefined), "");
});
