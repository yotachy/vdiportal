// scan-core — 스캐너 순수 로직. 엔진·네트워크 없이 도는 부분만 여기서 검증한다.
// 게이트는 실제 app-signals.rankSignal 을 경유한다(사본 금지 — 설계서 §7).
import { test } from "node:test";
import assert from "node:assert";
import { symbolUnion, pickImportant, digestText, buildSends } from "./scan-core.mjs";

const REG = [
  { device: "d1", picks: ["NVDA", "TSLA"], on: true },
  { device: "d2", picks: ["TSLA", "AAPL"], on: true }
];
const sig = (sym, rule, dir, title) => ({ sym, rule, dir, title, barT: "2026-08-27", key: sym + "|" + rule + "|2026-08-27" });

test("symbolUnion: 디바이스 종목 합집합(중복 제거·사전순)", () => {
  assert.deepEqual(symbolUnion(REG), ["AAPL", "NVDA", "TSLA"]);
});

test("symbolUnion: 종목 없는 등록은 무시", () => {
  assert.deepEqual(symbolUnion([{ device: "x", picks: [], on: true }, { device: "y", picks: null, on: true }]), []);
});

test("pickImportant: 게이트 통과분만·확신 강한 순", () => {
  const sigs = {
    NVDA: [sig("NVDA", "vol_surge", 0, "거래량 평균의 2.4배")],
    TSLA: [sig("TSLA", "ma20_up", 1, "20일선 상향 돌파")]
  };
  const verdicts = { NVDA: { regime: "bull", prob: 66 }, TSLA: { regime: "bull", prob: 84 } };
  const got = pickImportant(REG[0], sigs, verdicts, { conv: 0.3, cap: 3 });
  assert.deepEqual(got.map((x) => x.sig.sym), ["TSLA", "NVDA"]);   // 0.68 > 0.32
});

test("pickImportant: 미정렬·약한 확신은 탈락", () => {
  const sigs = { NVDA: [sig("NVDA", "ma20_up", 1, "20일선 상향 돌파")], TSLA: [sig("TSLA", "gap", -1, "갭 하락 3.1%")] };
  const verdicts = { NVDA: { regime: "bull", prob: 55 }, TSLA: { regime: "bull", prob: 90 } };
  assert.equal(pickImportant(REG[0], sigs, verdicts, { conv: 0.3, cap: 3 }).length, 0);
});

test("pickImportant: 디바이스 하루 캡", () => {
  const sigs = { NVDA: [sig("NVDA", "a", 1, "A"), sig("NVDA", "b", 1, "B"), sig("NVDA", "c", 1, "C")] };
  const verdicts = { NVDA: { regime: "bull", prob: 90 } };
  assert.equal(pickImportant({ device: "d", picks: ["NVDA"], on: true }, sigs, verdicts, { conv: 0.3, cap: 2 }).length, 2);
});

test("pickImportant: 판정 없는 종목은 통째로 탈락(엔진 실패 시 지어내지 않는다)", () => {
  const sigs = { NVDA: [sig("NVDA", "ma20_up", 1, "20일선 상향 돌파")] };
  assert.equal(pickImportant(REG[0], sigs, {}, { conv: 0.3, cap: 3 }).length, 0);
});

test("digestText: 실제 감지 제목만 · 건수 정직", () => {
  const items = [{ sig: sig("TSLA", "ma20_up", 1, "20일선 상향 돌파"), score: 0.68 },
    { sig: sig("NVDA", "vol_surge", 0, "거래량 평균의 2.4배"), score: 0.32 }];
  const d = digestText(items);
  assert.equal(d.title, "오늘 주목할 신호 2건");
  assert.equal(d.body, "TSLA 20일선 상향 돌파 · NVDA 거래량 평균의 2.4배");
});

test("digestText: 1건이면 종목·제목을 제목에 그대로", () => {
  const d = digestText([{ sig: sig("TSLA", "ma20_up", 1, "20일선 상향 돌파"), score: 0.68 }]);
  assert.equal(d.title, "TSLA 20일선 상향 돌파");
  assert.ok(d.body.indexOf("엔진") >= 0);
});

test("buildSends: 중요 0건 디바이스는 발송 대상에서 빠진다", () => {
  const sigs = { TSLA: [sig("TSLA", "ma20_up", 1, "20일선 상향 돌파")] };
  const verdicts = { TSLA: { regime: "bull", prob: 84 } };
  const sends = buildSends(REG, sigs, verdicts, { conv: 0.3, cap: 3, day: "2026-08-27" });
  assert.equal(sends.length, 2);           // 둘 다 TSLA 를 담고 있다
  assert.equal(sends[0].device, "d1");
  assert.deepEqual(sends[0].data.keys, ["TSLA|ma20_up|2026-08-27"]);
  assert.equal(sends[0].data.day, "2026-08-27");

  const none = buildSends([{ device: "d3", picks: ["MSFT"], on: true }], sigs, verdicts, { conv: 0.3, cap: 3, day: "2026-08-27" });
  assert.equal(none.length, 0);
});

test("buildSends: 알림 끈 디바이스는 제외", () => {
  const sigs = { TSLA: [sig("TSLA", "ma20_up", 1, "20일선 상향 돌파")] };
  const verdicts = { TSLA: { regime: "bull", prob: 84 } };
  assert.equal(buildSends([{ device: "off", picks: ["TSLA"], on: false }], sigs, verdicts,
    { conv: 0.3, cap: 3, day: "2026-08-27" }).length, 0);
});
