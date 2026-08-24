// app-config 정책 테이블 테스트 — 기대값은 지침서·해부 문서의 수치를 직접 적는다(구현 상수 재사용 금지).
const { test } = require("node:test");
const assert = require("node:assert");
const config = require("./app-config.js");

test("스쿱 상한: Lv1=15 Lv2=17 Lv3=19 Lv5=23, 범위 밖 방어", () => {
  assert.equal(config.scoopCap(1), 15);
  assert.equal(config.scoopCap(2), 17);
  assert.equal(config.scoopCap(3), 19);
  assert.equal(config.scoopCap(5), 23);
  assert.equal(config.scoopCap(0), 15);   // 하한 방어
  assert.equal(config.scoopCap(undefined), 15);
});

test("레벨: 기저 없음(Q2) — 0→1, 39→1, 40→2, 69→2, 70→3, 110→4, 160→5, 999→5", () => {
  assert.equal(config.levelOf(0), 1);
  assert.equal(config.levelOf(39), 1);
  assert.equal(config.levelOf(40), 2);
  assert.equal(config.levelOf(69), 2);
  assert.equal(config.levelOf(70), 3);
  assert.equal(config.levelOf(110), 4);
  assert.equal(config.levelOf(160), 5);
  assert.equal(config.levelOf(999), 5);
});

test("applyRemote: 아는 키만 깊이 병합, 미지 키 무시", () => {
  config.applyRemote({ scoop: { costDeep: 4 }, hacker: { x: 1 } });
  assert.equal(config.POLICY.scoop.costDeep, 4);
  assert.equal(config.POLICY.scoop.costCustom, 3); // 형제 키 보존
  assert.equal(config.POLICY.hacker, undefined);
  config.applyRemote({ scoop: { costDeep: 2 } });  // 원복
  assert.equal(config.POLICY.scoop.costDeep, 2);
});

test("applyRemote: 배열은 통째 교체, 타입 불일치 무시", () => {
  config.applyRemote({ xp: { levels: [50, 80, 120, 170] } });
  assert.deepEqual(config.POLICY.xp.levels, [50, 80, 120, 170]);
  assert.equal(config.levelOf(45), 1);  // 갱신된 임계가 즉시 반영
  config.applyRemote({ xp: { levels: "broken" } });
  assert.deepEqual(config.POLICY.xp.levels, [50, 80, 120, 170]); // 무시
  config.applyRemote({ xp: { levels: [40, 70, 110, 160] } });    // 원복
});

test("정책 기준선 스모크 — 지침서 §8·§10 수치", () => {
  const P = config.POLICY;
  assert.equal(P.scoop.start, 15);
  assert.equal(P.scoop.costDeep, 2);
  assert.equal(P.scoop.costCustom, 3);
  assert.equal(P.scoop.checkin.amount, 1);
  assert.equal(P.scoop.checkin.intervalSec, 21600);
  assert.equal(P.scoop.streak.days, 7);
  assert.equal(P.scoop.streak.bonus, 5);
  assert.equal(P.scoop.ad.scoop, 3);
  assert.equal(P.scoop.ad.xp, 5);
  assert.equal(P.scoop.hitRefund, 1);            // Q1 확정
  assert.equal(P.analysis.ttlMs, 86400000);
  assert.equal(P.analysis.warnMs, 10800000);
  assert.equal(P.analysis.basicCount, 5);
  assert.equal(P.analysis.fullCount, 32);
  assert.equal(P.analysis.concurrent, 1);
  assert.deepEqual(P.analysis.reanalysisFreeTiers, ["deep", "custom"]); // Q3 대칭
  assert.deepEqual(P.xp.levels, [40, 70, 110, 160]);
  assert.equal(P.xp.firstVisit, 5);
  assert.equal(P.xp.menuFirst, 3);
  assert.equal(P.xp.personaAnswer, 1);
  assert.equal(P.xp.drawToggle.perDay, 3);
  assert.equal(P.limits.stocksMax, 12);
  assert.equal(P.limits.stockOpsPerDay, 6);
  assert.equal(P.limits.signal.keepDays, 3);
  assert.equal(P.limits.signal.page, 20);
  assert.equal(P.limits.score.keepDays, 90);
  assert.equal(P.limits.persona.perDay, 5);
  assert.equal(P.limits.persona.guestMax, 3);
  assert.deepEqual(P.persona.stages, [0, 4, 9, 16, 31, 61]);
  assert.equal(P.persona.stageNames.length, 6);
  assert.equal(P.ui.sheetClosePx, 90);
  assert.equal(P.ui.skeletonMs, 180);
  assert.equal(P.ui.toastMs, 1800);
  assert.equal(P.ui.toastNegMs, 3200);
  assert.deepEqual(P.ui.haptics.deduct, [30, 40, 30]);
  assert.deepEqual(P.ui.haptics.done, [15, 30, 60]);
  assert.deepEqual(P.ui.haptics.warn, [60, 50, 60]);
});
