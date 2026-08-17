// 지표 등급표가 엔진·기본 티어와 어긋나지 않는지. 이 표는 PC(forge-state.js IND_TIERS)의
// 두 번째 사본이라, 관문이 없으면 한쪽만 늘어난 채로 화면이 "32개 중 24개"라고 말하면서
// 목록에는 다른 수를 그린다.
import { test } from "node:test";
import assert from "node:assert";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const T = require("../www/ind-tiers.js");
const G = require("../www/graph.js");
const FC = require("../../forge-core.js");

test("등급표의 지표 수가 엔진의 지표 수와 같다", () => {
  assert.strictEqual(T.all().length, FC.indicatorCount,
    "등급표 " + T.all().length + " vs 엔진 " + FC.indicatorCount + " — 지표가 늘거나 줄었는데 표가 안 따라왔다");
});

test("중복도 누락도 없다", () => {
  const all = T.all();
  assert.strictEqual(new Set(all).size, all.length, "같은 지표가 두 등급에 있다");
});

test("Lv1 은 기본 티어가 읽는 5종과 정확히 같다", () => {
  const lv1 = T.TIERS.find(t => t.lv === 1).types.slice().sort();
  assert.deepEqual(lv1, G.BASIC.slice().sort(),
    "Lv1(핵심)과 MSGraph.BASIC 이 다르다 — 시안이 'Lv1 핵심 5 · 기본분석과 같은 것'이라고 적은 전제가 깨진다");
});

// 인벤토리 §0 충돌 1 — 심화 판정은 32 전부, 전문 가중치 레일은 30(gann·pattern 제외).
test("가중치 조절 대상은 30종이다 — gann·pattern 은 빠진다", () => {
  assert.strictEqual(T.tunable().length, T.all().length - 2);
  assert.strictEqual(T.tunable().length, 30, "전문 편집 레일이 30 이 아니다: " + T.tunable().length);
  T.NOT_TUNABLE.forEach(t => {
    assert.ok(T.all().indexOf(t) >= 0, t + " 가 등급표에 없다 — 제외 목록이 낡았다");
    assert.ok(T.tunable().indexOf(t) < 0, t + " 가 조절 대상에 남아 있다");
  });
});

test("엔진이 아는 지표만 등급표에 있다 — 오타는 raw price 를 combine 에 주입한다", () => {
  const I = require("../www/indicators.js");
  const unknown = T.all().filter(t => !I.SHAPES[t] && I.NO_BIAS.indexOf(t) < 0);
  assert.deepEqual(unknown, [], "엔진이 모르는 blockType: " + unknown.join(", "));
});
