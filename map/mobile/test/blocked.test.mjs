// P2 §8 — 막히는 상태 7종(시안 12c).
//
// 이 화면들은 **자연 발생을 기다릴 수 없다**(쿨다운 2분·일 상한 8회·지갑 상한 20). 구현 후
// 아무도 못 보고 지나갈 수 있어서, 상태를 주입해 일곱 장을 전부 그리는 하네스를 먼저 둔다.
// 관문이 보는 것은 카드 모양이 아니라 **공통 규칙 셋**이다 — 그게 이 목록의 존재 이유다.
import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const S = require("../www/strings.js");

const SRC = readFileSync(new URL("../www/blocked.js", import.meta.url), "utf8");

// ── 상태 주입 하네스 ──────────────────────────────────────────────────────────────
// DOM 은 최소만 흉내 낸다(el/appendChild/setAttribute) — 여기서 재는 것은 배치가 아니라
// "무엇이 그려지고 무엇이 안 그려지는가"다.
function el(tag, cls, text) {
  return {
    tag, cls: cls || "", text: text == null ? "" : String(text), children: [], attrs: {}, style: {},
    appendChild(c) { this.children.push(c); return c; },
    setAttribute(k, v) { this.attrs[k] = v; },
    addEventListener() {}
  };
}
const win = {};
new Function("window", "MSUi", "MSStr", SRC)(win, { el }, S);
const B = win.MSBlocked;

function walk(node, out) {
  out = out || [];
  out.push(node);
  node.children.forEach(c => walk(c, out));
  return out;
}
function textOf(node) { return walk(node).map(n => n.text).join(" "); }
function buttons(node) { return walk(node).filter(n => n.tag === "button"); }

// 일곱 장 각각을 실제로 그려 본다 — 데이터는 서버가 주는 모양 그대로.
const SAMPLE = {
  short: { need: 3, have: 1 },
  cooldown: { secondsLeft: 72, windowSeconds: 120 },
  dailyCap: {},
  walletCap: { balance: 19, cap: 20, grant: 3 },
  noVerdict: { total: 32, up: 15, down: 15 },
  failedRefunded: { refunded: 3, balance: 12 },
  failedUnknown: {}
};

test("일곱 장이 전부 그려진다 — 여섯이 아니다(t13 이 7번째를 추가한 정정)", () => {
  assert.strictEqual(B.KINDS.length, 7, "카드가 7종이 아니다: " + B.KINDS.join(", "));
  B.KINDS.forEach(k => {
    const card = B.render(k, SAMPLE[k], null);
    assert.ok(card, k + " 카드가 안 그려진다");
    assert.ok(textOf(card).trim().length > 0, k + " 카드가 비어 있다");
  });
});

// 규칙 ① 막다른 골목 금지.
test("규칙① — 일곱 장 전부에 '지금 할 수 있는 다른 행동'이 있다", () => {
  B.KINDS.forEach(k => {
    const card = B.render(k, SAMPLE[k], null);
    const bs = buttons(card);
    assert.ok(bs.length >= 1, k + " 에 행동 버튼이 없다 — 막다른 골목이다");
    bs.forEach(b => assert.ok(String(b.text).trim().length > 0, k + " 의 버튼에 라벨이 없다"));
  });
});

test("규칙① — 기다려야 하는 상태에도 '지금 할 수 있는 것'이 붙는다", () => {
  const map = { cooldown: "basic-first", dailyCap: "checkin", walletCap: "spend-first" };
  Object.keys(map).forEach(k => {
    const kinds = buttons(B.render(k, SAMPLE[k], null)).map(b => b.attrs["data-action"]);
    assert.ok(kinds.indexOf(map[k]) >= 0,
      k + " 의 대안 행동(" + map[k] + ")이 없다 — 기다리라는 말만 남는다");
  });
});

// 규칙 ② 불리한 사실을 행동 **전에**. 광고를 튼 뒤 "2개 버려졌습니다"는 고지가 아니다.
test("규칙② — 지갑 상한 카드가 버려질 개수를 광고 전에 말한다", () => {
  const card = B.render("walletCap", SAMPLE.walletCap, null);
  const t = textOf(card);
  assert.ok(t.indexOf("2") >= 0, "버려질 개수(19+3−20=2)를 안 말한다: " + t);
  assert.ok(t.indexOf("버려집니다") >= 0, "버려진다는 사실 자체를 안 말한다");
  // 그리고 그 문장이 **행동 버튼보다 위**에 있어야 한다.
  const flat = walk(card);
  const bodyAt = flat.findIndex(n => n.cls === "bl-body");
  const actAt = flat.findIndex(n => n.cls === "bl-actions");
  assert.ok(bodyAt >= 0 && actAt > bodyAt, "고지가 행동 버튼 뒤에 있다");
});

test("규칙② — 버려질 개수는 계산된다(리터럴이 아니다)", () => {
  const t = textOf(B.render("walletCap", { balance: 18, cap: 20, grant: 5 }, null));
  assert.ok(t.indexOf("3") >= 0, "18+5−20=3 을 안 말한다: " + t);
});

// 규칙 ③ 못 준 값은 안 받는다 — 단 확인 못 했으면 확인했다고 하지 않는다.
test("규칙③ — 판정 없음은 '스쿱을 쓰지 않았다'고 말한다", () => {
  const t = textOf(B.render("noVerdict", SAMPLE.noVerdict, null));
  assert.ok(t.indexOf("쓰지 않았습니다") >= 0, "미차감 사실을 안 말한다: " + t);
  assert.ok(t.indexOf("15") >= 0 && t.indexOf("32") >= 0, "무엇이 어떻게 갈렸는지 안 말한다");
});

test("규칙③ — 실패가 두 장인 것이 이 목록의 요점이다(확인됨 ≠ 확인 불가)", () => {
  const ok = textOf(B.render("failedRefunded", SAMPLE.failedRefunded, null));
  const unk = textOf(B.render("failedUnknown", SAMPLE.failedUnknown, null));
  assert.ok(ok.indexOf("돌려드렸습니다") >= 0, "환급 확정 카드가 환급을 안 말한다");
  assert.ok(unk.indexOf("돌려드렸다고 말하지 않겠습니다") >= 0,
    "환급 미확인 카드가 환급을 단정한다 — 이 카드가 존재하는 유일한 이유가 그걸 안 하는 것이다");
  // 있어야 할 문장이 있는지만 보면 **모순된 문장을 덧붙이는 것**을 못 잡는다(변이 검증에서
  // "스쿱을 돌려드렸습니다. 원래는 돌려드렸다고 말하지 않겠습니다" 가 그대로 통과했다).
  assert.ok(unk.indexOf("돌려드렸습니다") < 0,
    "미확인 카드가 환급을 확정 어조로도 말한다 — 한 카드가 두 가지를 말하면 확정 쪽이 읽힌다");
  assert.ok(unk.indexOf("중복 차감되지 않습니다") >= 0, "재시도가 안전하다는 사실을 안 말한다");
  // 미확인 카드는 잔량을 직접 확인할 길을 준다.
  const kinds = buttons(B.render("failedUnknown", SAMPLE.failedUnknown, null)).map(b => b.attrs["data-action"]);
  assert.ok(kinds.indexOf("open-wallet") >= 0 && kinds.indexOf("retry") >= 0,
    "미확인 카드에 지갑 확인·다시 시도 둘 다 있어야 한다: " + kinds.join(","));
});

test("환급 미확인 카드는 금액을 지어내지 않는다 — 데이터가 없어도 그려진다", () => {
  const t = textOf(B.render("failedUnknown", {}, null));
  assert.ok(!/\d/.test(t.replace(/[^\d]/g, "")) || t.indexOf("undefined") < 0,
    "미확인 카드가 숫자를 지어낸다: " + t);
  assert.ok(t.indexOf("undefined") < 0 && t.indexOf("NaN") < 0, "빈 데이터가 문구에 샜다: " + t);
});

test("쿨다운 남은 시간은 서버 값으로 계산된다 — 클라이언트가 2분을 다시 적지 않는다", () => {
  assert.strictEqual(B.fmtLeft(72), "1" + S.t.blMin + "12" + S.t.blSec);
  assert.strictEqual(B.fmtLeft(45), "45" + S.t.blSec);
  assert.strictEqual(B.fmtLeft(-5), "0" + S.t.blSec, "음수(시계 어긋남)가 그대로 나간다");
});

test("모르는 상태는 카드를 지어내지 않는다", () => {
  assert.strictEqual(B.render("nope", {}, null), null);
});

// 카드마다 손으로 규칙을 지키면 여덟 번째에서 깨진다 — 선언에 행동이 없는 카드가 있으면 실패.
test("선언 자체에 행동 없는 카드가 없다 — 새 카드도 같은 규칙을 받는다", () => {
  Object.keys(B.CARDS).forEach(k => {
    assert.ok(B.CARDS[k].actions && B.CARDS[k].actions.length >= 1,
      k + " 선언에 행동이 없다 — 막다른 골목 카드를 추가할 수 있게 열려 있다");
  });
  assert.deepEqual(Object.keys(B.CARDS).sort(), B.KINDS.slice().sort(),
    "선언과 목록이 어긋난다 — 한쪽에만 있는 카드는 조용히 안 그려지거나 관문을 안 받는다");
});

// ── I2(리뷰 2026-08-19) — failedUnknown 카드가 badge/head/body 오버라이드를 받는다 ──
// report.js 가 merged·unauthorized 사유를 "환불 확인 불가"라는 틀린 전제 없이 같은 카드
// (같은 두 버튼)로 보내려면 문구만 갈아 끼울 길이 필요했다. 오버라이드가 없으면(기존
// 호출부 전부, data:{}) 원래 문구 그대로여야 하위 호환이 깨지지 않는다.
test("failedUnknown — badge/head/body 를 안 주면 기본 문구(환불 확인 불가) 그대로다", () => {
  const t = textOf(B.render("failedUnknown", {}, null));
  assert.ok(t.indexOf(S.t.blFailUnknownBadge) >= 0, "기본 배지가 없다: " + t);
  assert.ok(t.indexOf(S.t.blFailUnknownHead) >= 0, "기본 헤드가 없다: " + t);
  assert.ok(t.indexOf(S.t.blFailUnknownBody) >= 0, "기본 본문이 없다: " + t);
});

test("failedUnknown — badge/head/body 를 주면(merged 사유) 그 문구로 갈아 끼워진다", () => {
  const data = { badge: S.t.tsSpendMergedBadge, head: S.t.tsSpendMergedHead, body: S.t.wMerged };
  const t = textOf(B.render("failedUnknown", data, null));
  assert.ok(t.indexOf(S.t.tsSpendMergedBadge) >= 0, "merged 배지가 안 나왔다: " + t);
  assert.ok(t.indexOf(S.t.tsSpendMergedHead) >= 0, "merged 헤드가 안 나왔다: " + t);
  assert.ok(t.indexOf(S.t.wMerged) >= 0, "wMerged 본문이 안 나왔다: " + t);
  // 기본 "환불 확인 불가" 전제(계산이 실패했다는 틀린 프레임)가 섞이면 안 된다 — merged 는
  // 애초에 계산이 실패한 게 아니라 지갑이 다른 계정으로 넘어간 것이다.
  assert.ok(t.indexOf(S.t.blFailUnknownBadge) < 0, "기본 배지가 오버라이드를 뚫고 섞여 나왔다: " + t);
  assert.ok(t.indexOf(S.t.blFailUnknownBody) < 0, "기본 본문(환불 확인 불가 전제)이 섞여 나왔다: " + t);
  // 버튼(open-wallet·retry)은 오버라이드와 무관하게 그대로 있어야 한다.
  const kinds = buttons(B.render("failedUnknown", data, null)).map(b => b.attrs["data-action"]);
  assert.ok(kinds.indexOf("open-wallet") >= 0 && kinds.indexOf("retry") >= 0,
    "오버라이드본도 지갑 확인·다시 시도 버튼이 있어야 한다: " + kinds.join(","));
});
