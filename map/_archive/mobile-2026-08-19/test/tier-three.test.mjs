// 리뷰가 잡은 결함 다섯의 공통 뿌리 — report.js 가 티어를 **둘로** 알고 있었다.
//
// `tier === "full"` 이항 분기가 여섯 곳에 흩어져 있었고, custom 이 전부 basic 가지로 떨어졌다.
// 결과는 5스쿱 낸 전문분석이 3스쿱 심화보다 **적은** 블록을 "기본" 배지·"지표 5개"·1/3 세그먼트와
// 함께 내고, "기본분석은 5개 지표가 하는 말만 알려줍니다"라는 사실과 다른 면책까지 붙는 것이었다.
// 문자열 비교라 예외가 안 나고 관문 666건이 전부 초록인 채로 통과했다 — 그래서 관문이 필요하다.
//
// 여기서 재는 것은 "어느 줄이 어떻게 생겼나"가 아니라 성질 둘이다:
//   ① 티어를 직접 이항 비교하지 않는다(묻는 방식이 isPaid / 표 조회여야 한다)
//   ② 표가 실제 티어 전부를 덮는다(report-blocks 의 TIERS 가 정본)
import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const REPORT = readFileSync(new URL("../www/screens/report.js", import.meta.url), "utf8");
// 주석을 벗긴 본문 — 관문이 "왜 이렇게 고쳤는지" 설명하는 주석 자체에 걸리면, 다음 사람은
// 관문을 통과시키려고 설명을 지운다. 재는 것은 코드지 산문이 아니다.
const CODE = REPORT.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const S = require("../www/strings.js");
const Blocks = require("../www/report-blocks.js");

// 정본 티어 목록 — 여기서 세지 않고 report-blocks 에서 가져온다. 넷째 티어가 생기면 이 관문이
// 스스로 늘어나야지, 테스트가 셋을 외우고 있으면 새 티어가 조용히 빠진다.
// report-blocks.js 가 orderOf → forTier 로 개명됐다(P1a Task 2, {id,kind} 배열을 돌려준다).
const TIERS = ["basic", "full", "custom"].filter(t => Blocks.forTier(t).length > 0);

function bodyOf(src, name) {
  const at = src.indexOf("function " + name + "(");
  assert.ok(at > 0, name + " 이 없다");
  const brace = src.indexOf("{", at);
  let d = 0;
  for (let i = brace; i < src.length; i++) {
    if (src[i] === "{") d++;
    else if (src[i] === "}" && --d === 0) return src.slice(brace, i + 1);
  }
  throw new Error(name + " 본문을 못 닫았다");
}

test("티어를 직접 이항 비교하지 않는다 — custom 이 basic 가지로 떨어지던 형태", () => {
  // 통과하면 안 되는 구체적 형태: tier 변수를 "full"/"basic" 과 직접 견주는 모든 꼴.
  // isPaid(t) 의 정의부는 매개변수가 t 라 여기 안 걸린다 — 정의는 한 곳이어야 하고,
  // 그 한 곳이 이 파일에서 티어 문자열을 아는 유일한 자리다.
  // "basic 인가"(무료인가) · "custom 인가"(조절판이 있는가)는 정당한 질문이라 남는다.
  // 무너진 것은 **"full 인가"로 값을 치른 티어 전부를 물었던** 자리다 — custom 이 여기 안 걸린다.
  const bad = [];
  const re = /tier\s*(===|!==|==|!=)\s*"full"/g;
  let m;
  while ((m = re.exec(CODE))) {
    bad.push(CODE.slice(0, m.index).split("\n").length + "행(주석 제외): " + m[0]);
  }
  assert.deepEqual(bad, [],
    "티어를 직접 비교하는 자리가 남았다 — isPaid() 나 표 조회로 물어야 한다:\n" + bad.join("\n"));
});

test("isPaid 는 값을 치른 티어 전부를 참으로 본다", () => {
  const fn = new Function("return " + bodyOf(REPORT, "isPaid").replace(/^\{/, "function(t){").replace(/\}$/, "}"))();
  assert.equal(fn("basic"), false, "basic 은 무료다");
  TIERS.filter(t => t !== "basic").forEach(t => {
    assert.equal(fn(t), true, t + " 는 값을 치른 티어인데 isPaid 가 거짓을 돌려준다 — " +
      "이 한 줄이 판독문·반대 블록·지표 집계를 통째로 없앤다");
  });
});

// ── I2(리뷰 2026-08-19) — spend-fail 사유 → 카드 매핑을 DOM·프라미스 없이 직접 잰다 ──
// runTier() 안에 박아 두면 전체 구매 흐름(vm + MSWallet.spend 모킹 + 클릭 시뮬레이션)을
// 재생해야만 이 매핑을 시험할 수 있다 — spendFailCardFor() 로 뽑은 순수 함수라 body 를
// 직접 평가해 잰다(위 isPaid 시험과 같은 기법).
test("spendFailCardFor — merged·unauthorized 는 카드를 돌려주고, 문구가 사실과 맞는다", () => {
  const fn = new Function("MSStr",
    "return " + bodyOf(REPORT, "spendFailCardFor").replace(/^\{/, "function(reason){").replace(/\}$/, "}"))(S);
  const merged = fn("merged");
  assert.ok(merged, "merged 가 카드를 안 돌려준다 — alert 로 떨어진다");
  assert.strictEqual(merged.body, S.t.wMerged,
    "merged 카드 본문이 wMerged 가 아니다 — wallet.js:348 의 checkin() 처리와 문구가 갈린다");
  assert.notStrictEqual(merged.badge, S.t.blFailUnknownBadge,
    "merged 가 '계산 실패·환불 확인 불가' 기본 배지를 그대로 쓴다 — 계산은 애초에 실패한 적이 없다");

  const unauthorized = fn("unauthorized");
  assert.ok(unauthorized, "unauthorized 가 카드를 안 돌려준다 — alert 로 떨어진다");
  assert.strictEqual(unauthorized.body, S.t.tsSpendUnauthorizedBody);
  assert.notStrictEqual(unauthorized.badge, S.t.blFailUnknownBadge,
    "unauthorized 가 기본 배지를 그대로 쓴다 — 인증 문제를 '계산 실패'로 잘못 말한다");
});

test("spendFailCardFor — 카드로 안 옮긴 사유는 여전히 null(호출부가 alert 로 떨어진다는 계약)", () => {
  const fn = new Function("MSStr",
    "return " + bodyOf(REPORT, "spendFailCardFor").replace(/^\{/, "function(reason){").replace(/\}$/, "}"))(S);
  ["rate-limited", "no-backend", "bad-ref", "storage", "insufficient", "network", "server-error", "busy"]
    .forEach(r => {
      assert.strictEqual(fn(r), null,
        r + " 가 spendFailCardFor 에서 카드를 받는다 — 호출부의 다른 분기(maybeCharged·insufficient)와 " +
        "겹치거나, 판단 없이 조용히 카드로 승격됐다");
    });
});

test("배지 표가 티어 전부를 덮고, 셋이 서로 다른 것을 말한다", () => {
  const at = REPORT.indexOf("var TIER_BADGE = {");
  assert.ok(at > 0, "TIER_BADGE 표가 없다");
  const open = REPORT.indexOf("{", at);
  let d = 0, end = -1;
  for (let i = open; i < REPORT.length; i++) {
    if (REPORT[i] === "{") d++;
    else if (REPORT[i] === "}" && --d === 0) { end = i + 1; break; }
  }
  const BADGE = new Function("MSStr", "return " + REPORT.slice(open, end))(S);

  assert.deepEqual(Object.keys(BADGE).sort(), TIERS.slice().sort(),
    "배지 표와 report-blocks 의 티어 목록이 어긋난다 — 표에 없는 티어는 basic 으로 그려진다");

  const names = new Set(), evis = new Set();
  const all = Object.values(S.t);
  TIERS.forEach(t => {
    const b = BADGE[t];
    // 표는 키 이름이 아니라 **값**을 담는다(정적 분석이 볼 수 있어야 한다) — 그 값이 실제
    // strings.js 에서 온 것인지 여기서 확인한다. 손으로 적은 한글이 섞이면 걸린다.
    assert.ok(all.indexOf(b.name) >= 0, t + " 의 배지 문구가 strings.js 에서 오지 않았다: " + b.name);
    if (t === "custom") {
      // [리뷰 C1, 2026-08-19] custom 은 desc 가 표에 없다 — 사용자가 고른 부분집합이라
      // 고정 문자열이 성립하지 않는다(전문 프리셋마다 실제 지표 수가 다르다, 실측:
      // "추세 추종" 기본 = 9). report.js tierBadgeDesc() 가 an.graph 에서 유도해 아래 두
      // 조각(rpTierCountCustomA/B)을 조립한다 — 조각이 strings.js 에서 왔는지만 여기서 잰다.
      assert.strictEqual(b.desc, undefined, "custom 표에 정적 desc 가 남아 있다 — 유도 없이 리터럴로 되돌아갔다");
      assert.ok(all.indexOf(S.t.rpTierCountCustomA) >= 0 && all.indexOf(S.t.rpTierCountCustomB) >= 0,
        "custom 유도 desc 조각이 strings.js 에 없다");
    } else {
      assert.ok(all.indexOf(b.desc) >= 0, t + " 의 설명 문구가 strings.js 에서 오지 않았다: " + b.desc);
    }
    names.add(b.name);
    evis.add(b.evi);
  });
  assert.equal(names.size, TIERS.length,
    "두 티어가 같은 배지 이름을 쓴다 — 화면이 무엇을 산 것인지 말하지 못한다");
  assert.equal(evis.size, TIERS.length,
    "증거 세그먼트가 티어마다 다르지 않다 — 시안 6a 는 1/3 · 2/3 · 3/3 이다");
});

test("면책 문구는 무료 티어에서만 뜬다", () => {
  // "기본분석은 5개 지표가 하는 말만 알려줍니다" 가 값을 치른 화면에 뜨면 그것은 방금 산
  // 물건에 대한 거짓 진술이다. 성질로 잰다 — 본문이 isPaid 로 일찍 빠져나오는가.
  const body = bodyOf(REPORT, "buildMissingNote");
  assert.match(body, /isPaid\(tier\)/,
    "buildMissingNote 가 isPaid 로 묻지 않는다 — custom 화면에 기본 면책이 뜬다");
});

test("단계 선택 시트를 여는 모든 곳이 같은 분기를 쓴다", () => {
  // 시트가 넘겨준 picked 를 버리면 전문분석을 골라도 심화가 돌고 그 값이 나간다.
  // 시트를 여는 자리가 둘(CTA · 광고 시청 후)이라, 한쪽만 고치면 화면에 따라 다른 것을 산다.
  // MSTierSheet.open 자리만 본다 — MSExpert.open 의 onRun 은 picked 가 아니라 가중치를 받는
  // 다른 계약이라 여기 섞으면 안 된다.
  const opens = (CODE.match(/MSTierSheet\.open\(\{[\s\S]{0,400}?onRun:\s*([A-Za-z_$][\w$]*|function)/g) || [])
    .map(seg => "onRun: " + seg.split("onRun:")[1].trim());
  assert.ok(opens.length >= 2, "onRun 을 넘기는 자리를 못 찾았다 — 관문이 아무것도 안 보고 있다");
  const wrong = opens.filter(o => !/onRun:\s*runPicked/.test(o));
  assert.deepEqual(wrong, [],
    "시트 실행 분기가 한 벌이 아니다: " + wrong.join(", ") +
    " — runFull 을 직접 넘기면 picked 가 버려진다");
});

test("잔량 부족 카드의 '광고 보기'가 같은 구매를 다시 시도하지 않는다", () => {
  // 다시 시도하면 잔량이 그대로라 같은 카드가 또 뜬다 — 광고를 한 번도 안 띄우는 고리다.
  // blocked.js 규칙 ②(카드는 진짜 대안 행동을 준다)를 어기는 자리.
  const at = CODE.indexOf('kind: "short"');
  assert.ok(at > 0, "잔량 부족 카드를 여는 자리가 없다");
  const seg = CODE.slice(at, at + 700);
  const act = seg.match(/onAction:\s*function[^}]*\}/);
  assert.ok(act, "short 카드의 onAction 을 못 찾았다");
  assert.doesNotMatch(act[0], /runTier\s*\(/,
    "short 카드가 곧바로 구매를 재시도한다 — 잔량은 그대로이므로 같은 카드가 다시 뜬다");
  assert.match(act[0], /shortCardAd|Ad\(/,
    "short 카드가 광고 경로로 가지 않는다");
});
