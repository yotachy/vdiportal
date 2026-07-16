const test = require("node:test"), assert = require("node:assert");
const { peadArray } = require("./pead-feats.js");
// 100봉, 50번째 날짜 실적, 그 직후 +10% 반응(close[51]/close[49]-1≈+대)
const N = 100, dates = [], closes = [];
for (let i = 0; i < N; i++) { dates.push("2023-" + String(1 + Math.floor(i / 28)).padStart(2, "0") + "-" + String(1 + (i % 28)).padStart(2, "0")); closes.push(100); }
closes[51] = 111;   // 실적 직후 급등 → 반응 양수
const arr = peadArray(closes, dates, [dates[50]], { win: 45 });
test("peadArray: reaction sign in window, 0 outside, look-ahead safe", () => {
  assert.strictEqual(arr.length, N);
  // eIdx=50, 반응=close[51]/close[49]-1=+0.11 → 창 [52,95] 부호 양수
  assert.ok(arr[55][0] > 0, "창 내 reaction 양수");
  assert.ok(arr[55][1] > 0 && arr[55][1] < 1, "pos 정규화");
  // 창 밖(실적 전, t<52) = 0
  assert.deepStrictEqual(arr[40], [0, 0, 0, 0]);
  assert.deepStrictEqual(arr[50], [0, 0, 0, 0]);   // eIdx 자신 0(t>=eIdx+2만)
  assert.deepStrictEqual(arr[51], [0, 0, 0, 0]);   // eIdx+1도 0(look-ahead)
  // 창 넘어(eIdx+46=96 이후) 0
  assert.deepStrictEqual(arr[97], [0, 0, 0, 0]);
  // 감쇠: 창 초반 |reaction*decay| > 후반
  assert.ok(Math.abs(arr[53][2]) > Math.abs(arr[90][2]), "감쇠");
  // 빈/실적없음
  assert.deepStrictEqual(peadArray(closes, dates, [], {})[55], [0, 0, 0, 0]);
  assert.deepStrictEqual(peadArray(closes, dates, [dates[50]], { win: 45 }), arr);   // 결정성
});
