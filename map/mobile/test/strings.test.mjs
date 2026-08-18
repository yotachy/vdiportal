import { test } from "node:test";
import assert from "node:assert";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const S = require("../www/strings.js");
const FC = require("../../forge-core.js");
const G = require("../www/graph.js");

// 키 존재 가드(아래)와 미사용 키 가드(파일 하단)가 같은 목록을 스캔한다 — 한쪽만 갱신하면
// 새 소비 파일의 오타는 잡히는데 죽은 키는 못 잡는(또는 그 반대) 비대칭이 생긴다.
// 문자열을 소비하는 파일 목록 — **손으로 적지 않고 유도한다.**
// 예전엔 여기 경로를 하나하나 나열했다. 그 목록은 새 화면이 생길 때마다 낡았고, 낡은 순간
// 그 화면의 새 문구가 전부 "죽은 키"로 오판됐다(19a 를 붙이며 실제로 그렇게 걸렸다).
// www 아래 모든 스크립트가 앱에 실려 나가므로, 전부 보는 것이 좁게 보는 것보다 언제나 옳다 —
// 못 보는 파일이 없으면 오판도 없다.
const KEY_SCAN_FILES = (function () {
  const out = [];
  (function walk(rel) {
    readdirSync(new URL(rel, import.meta.url)).forEach(name => {
      if (name === "vendor" || name === "fonts") return;   // 생성물·자산
      const child = rel + name;
      if (statSync(new URL(child, import.meta.url)).isDirectory()) walk(child + "/");
      else if (name.endsWith(".js")) out.push(child);
    });
  })("../www/");
  return out;
})();
// Fix 1: chart-legend.js 는 `var T = Str.t` 로 별칭한 뒤 `T.legPred` 형태로 쓴다 — MSStr.t/Str.t 직접
// 참조만 잡던 정규식이 이 별칭 경로를 못 봐서, 존재하지 않는 T.키 오타가 조용히 undefined 를 렌더했다.
const KEY_RE = /\b(?:MSStr\.t|Str\.t|T)\.([A-Za-z_][A-Za-z0-9_]*)/g;

test("지표 표시명은 엔진의 32종을 전부 덮는다 — 빠지면 화면에 blockType 이 그대로 노출된다", () => {
  const types = G.indicatorTypes(G.full32Graph(FC));
  assert.equal(types.length, FC.indicatorCount, "그래프 지표 수가 엔진 개수와 다르다");
  const missing = types.filter(t => !S.ind(t) || S.ind(t) === t);
  assert.deepEqual(missing, [], "표시명 없는 지표: " + missing.join(", "));
});

test("모르는 blockType 은 그대로 돌려준다 — 던지지 않는다", () => {
  assert.equal(S.ind("nope"), "nope");
  assert.equal(S.ind(""), "");
  assert.equal(S.ind(undefined), "");
});

// P1 에서 방향이 뒤집혔다 — 앱은 한국어가 된다(시안 2026-08-16 번들, README "UI 는 한글 단독").
// 204개를 한 커밋에 번역하면 리뷰가 불가능하므로, 아직 영어인 키를 여기 적어두고 화면별로 지운다.
// 이 목록은 **줄어들기만 한다.** 새 키를 여기 넣는 것은 번역을 미루는 것이라 실패로 본다.
const PENDING_EN = [];

// 잔여 목록은 줄어들기만 해야 한다 — 이 상한이 그 규율을 코드로 박아둔다("줄어들기만 한다"는
// 주석 한 줄로는 아무것도 막지 못한다. 태스크 5~8 이 키를 번역해 목록에서 지우면 이 숫자도 함께
// 낮춘다. 숫자를 올리는 건 번역 대신 키를 추가하는 것이므로, 그 자체가 리뷰에서 드러나야 한다.
const MAX_PENDING_EN = 0;

// 라틴 글자가 연속된 한 덩어리 = 단어 하나. 부분 번역("티커 or 회사 Search")을 잡는 최소 단위다.
function latinWords(v) { return String(v).match(/[A-Za-z]+/g) || []; }

function reEscape(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

// 지표명 허용은 "단어" 단위가 아니라 "구문 전체"로 해야 한다 — S.IND 값을 단어로 쪼개 허용셋에
// 넣었더니(리뷰에서 실측 46개) Moving·average·Market·structure·Chart·pattern·Volume·profile
// 처럼 지표명의 일부에 불과한 흔한 영어 단어까지 통과선을 얻어, "시장 structure"·"거래 pattern"·
// "Chart 보기" 가 전부 초록으로 샜다. 그래서 값에서 **지표명 전체 문구**를 찾아 지운 다음
// 남는 라틴 단어만 검사한다 — "Chart pattern" 전체가 있어야 지워지지, "Chart"나 "pattern"
// 한쪽만으로는 안 지워진다. 긴 구문부터 지워야 "Volume profile" 이 소비되기 전에 "Volume" 만
// 지워져 "profile" 이 고아로 남는 일이 없다.
const IND_PHRASES = Object.keys(S.IND).map(k => String(S.IND[k])).sort((a, b) => b.length - a.length);

function stripIndicatorNames(v) {
  let s = String(v);
  IND_PHRASES.forEach(p => { s = s.replace(new RegExp(reEscape(p), "gi"), " "); });
  return s;
}

// 치환 템플릿({n}·{m}·{a}·{b} 등)의 자리표시자 이름은 번역 대상 단어가 아니다 — 태스크 6 에서
// 지갑 문구(wMergeDiscarded·adQuick/Full·adCooldown·walEquiv)를 번역하며 처음으로 걸렸다:
// {n}"의 "n"이 라틴 단어로 잡혀 "번역되다 만 문자열"로 오판됐다. 지표명과 같은 원리로 —
// **자리표시자 전체**({...})를 지운 다음 남는 라틴 단어만 본다.
function stripPlaceholders(v) { return String(v).replace(/\{[A-Za-z]+\}/g, " "); }

// HTML 태그(bootVendorMissing 의 <br> 등)는 콘텐츠가 아니라 마크업이다 — "br" 이 단어로
// 잡히면 태그를 쓰는 값은 절대 번역 완료 판정을 받을 수 없다. 자리표시자와 같은 이유로 지운다.
function stripTags(v) { return String(v).replace(/<[^>]+>/g, " "); }

// 허용 라틴 단어 소스 ①: 값에서 지표명 전체 문구를 지운 나머지 — "MACD 교차"·"Volume profile 확인"
// 처럼 문장 속에 지표명이 온전히 섞이는 건 정상이다(브리프의 명시 규칙: 지표명은 언어와 무관하게
// 영어). S.IND 가 바뀌면 이 목록도 같이 파생되므로 손으로 베낄 필요가 없다(hand-copy 금지).
//
// 허용 라틴 단어 소스 ②: 지표명이 아니면서 번역 후에도 영어로 남는 단어. 현재 strings.js 가
// 실제로 담고 있는 문구에 대응해 항목마다 이유를 적는다 — 근거 없이 단어를 여기 넣는 것은
// "번역 안 했다"를 숨기는 뒷문이 된다.
const ALLOWED_LATIN = [
  "ETF",               // wlChipETF — 한국 증권 앱은 전부 "ETF" 그대로 쓴다. "지수펀드"로 옮기면
                        // 지수를 추종하지 않는 ETF도 있어 원문에 없는 말을 보태는 셈이다(태스크 8 코디네이터 판정).
  "Google",            // wSignIn 등 구글 로그인 문구 — 고유명사, 번역하지 않는다
  "MoneyScoop",         // obRisk — 앱 이름 자체, 브랜드명이라 번역하지 않는다
  "Money", "Scoop",    // wlBrandA/wlBrandB — 헤더 워드마크(뒷조각 Scoop만 골드). 브랜드 마크지
                        // UI 카피가 아니다 — 머니스쿱으로 음역하면 제품 이름 자체를 이 타이포
                        // 태스크 안에서 바꾸는 셈이라(브랜드 결정), 고유명사로 남긴다(태스크 8 코디네이터 판정).
  "MA",                // legMaProj("MA 투영") — 지표 축약형. IND.ma 의 정식 표기("Moving average")와
                        // 문자열이 달라 stripIndicatorNames 로 안 지워진다. 이 값은 strings.js 에
                        // 실재하므로 국소 목록이 아니라 여기 있어야 한다(BB·%B 와 다른 점).
].map(w => w.toLowerCase());
const ALLOWED_LATIN_SET = new Set(ALLOWED_LATIN);

// 키 국소 허용 — 전역 목록에 있으면 문이 주석보다 넓어지는 단어들(P1 Task 8 이 minor 로 남긴 건).
// "v" 와 "ID" 는 각각 딱 한 값에서만 정당하다. 전역에 두면 앞으로 어떤 문구에 홀로 남은 "v"·"ID"
// 도 영원히 안 잡힌다 — 특히 "v" 는 한 글자라 라틴 단어 어디에나 생길 수 있다.
// 화면·캔버스 스캔 게이트는 키를 모르므로 이 목록을 못 본다. 그쪽에서 "v"·"ID" 가 나오면
// 잡히는 것이 맞다(그 자리엔 walEngine·wDeviceClaimed 가 없다).
const KEY_ALLOWED_LATIN = {
  walEngine: ["v"],          // "분석 엔진 v" + 버전 숫자 — semver 접두 v 는 번역 대상이 아니다
  wDeviceClaimed: ["ID"],    // "기기 ID" — 국문 UI 에서도 그대로 쓰는 관용 약어
  rdLv: ["Lv"],              // 판독문 섹션 라벨 "Lv1 핵심 지표" — 시안 20a 표기 그대로.
                             // 지표 등급의 관용 표기이고 한글로 옮기면("수준1") 오히려 낯설다.
  tcDeltaD: ["p"],           // 3단 대조(설계서 §3.3) "…%p 오릅니다" — %p(퍼센트포인트)는
                             // 상위 설계서 §9 가 이미 쓰는 표기 그대로다("실측은 +0.3%p").
                             // 국내 금융 UI 도 %p 를 그대로 쓴다(관용 약어, ID·Lv 와 같은 종류).
};
function untranslatedWordsForKey(key, v) {
  var extra = KEY_ALLOWED_LATIN[key];
  var words = untranslatedWords(v);
  if (!extra) return words;
  var set = new Set(extra.map(w => w.toLowerCase()));
  return words.filter(w => !set.has(w.toLowerCase()));
}

// 값에 남은 라틴 단어 중 지표명 전체 문구도, 자리표시자도, 허용 목록도 아닌 것 — 이게 하나라도
// 있으면 그 값은 "아직 번역이 안 끝났다"는 뜻이다. **PENDING_EN 판정과 절반-번역 판정 양쪽이
// 이 함수 하나를 그대로 쓴다.** 예전엔 PENDING_EN 판정이 "라틴 글자가 하나라도 있고 한글이
// 전혀 없으면 미번역"으로 값 전체를 봤다 — 그러면 "Money"·"ETF"처럼 애초에 한글이 붙을 수
// 없는 고유명사·관용 코드는 번역해도 이 목록을 절대 벗어날 수 없었다(태스크 8 리뷰가 잡은
// 관문 결함: 번역 문제가 아니라 완료조건 자체가 도달 불가능했다). 허용 단어로만 이루어진
// 값은 미완성이 아니라 완성이다 — 단어 단위로 판단해야 "Money Scoop Retry" 처럼 허용된
// 단어 옆에 안 허용된 단어가 붙어도 여전히 샌다(아래 회귀 테스트가 그 경계를 증명한다).
function untranslatedWords(v) {
  return latinWords(stripPlaceholders(stripTags(stripIndicatorNames(v)))).filter(w => !ALLOWED_LATIN_SET.has(w.toLowerCase()));
}

test("허용 라틴 단어는 단어 단위로 걸러진다 — 허용된 단어 옆에 안 허용된 단어가 붙어도 샌다", () => {
  assert.ok(untranslatedWords("Money Scoop Retry").length > 0,
    "허용된 Money·Scoop 옆의 Retry(비허용)를 못 잡았다");
  assert.ok(untranslatedWords("Retry").length > 0, "완전 미번역 값이 안 잡혔다");
  assert.deepEqual(untranslatedWords("ETF 보기"), [], "허용된 라틴 단어(ETF)만 있는데 잡혔다");
  // 키 국소 허용은 그 키에서만 산다 — 전역으로 새면 이 목록을 따로 둔 의미가 없다.
  assert.deepEqual(untranslatedWordsForKey("walEngine", "분석 엔진 v"), [],
    "walEngine 의 semver 접두 v 가 잡혔다");
  assert.ok(untranslatedWordsForKey("wlSearch", "티커 v 회사").length > 0,
    "다른 키에 홀로 남은 'v' 를 흘려보낸다 — 키 국소 허용이 전역으로 샜다");
  assert.ok(untranslatedWordsForKey("wlSearch", "기기 ID 확인").length > 0,
    "다른 키에 홀로 남은 'ID' 를 흘려보낸다 — 키 국소 허용이 전역으로 샜다");
});

test("UI 문자열은 한국어다 — 잔여 목록에 적힌 것만 예외", () => {
  const en = Object.keys(S.t).filter(k => untranslatedWordsForKey(k, S.t[k]).length > 0);
  const unlisted = en.filter(k => PENDING_EN.indexOf(k) < 0);
  assert.deepEqual(unlisted, [],
    "번역 안 됐는데 잔여 목록에도 없는 키 " + unlisted.length + "건: " + unlisted.join(", "));
  const stale = PENDING_EN.filter(k => en.indexOf(k) < 0);
  assert.deepEqual(stale, [],
    "이미 번역됐는데 잔여 목록에 남은 키(목록을 지울 것) " + stale.length + "건: " + stale.join(", "));
});

test("잔여 목록은 늘어나지 않는다 — 상한을 올리는 건 리뷰가 봐야 할 결정이다", () => {
  assert.ok(PENDING_EN.length <= MAX_PENDING_EN,
    "PENDING_EN 이 상한(" + MAX_PENDING_EN + ")을 넘었다: " + PENDING_EN.length + "건. " +
    "번역 대신 키를 추가한 것이라면 되돌릴 것 — 정말 상한을 올릴 의도라면 MAX_PENDING_EN 도 같이 올릴 것.");
});

test("번역된 문자열에 남은 라틴 단어는 허용 목록에 있어야 한다 — 절반만 번역한 문구를 잡는다", () => {
  const offenders = [];
  Object.keys(S.t).forEach(k => {
    if (PENDING_EN.indexOf(k) >= 0) return; // 아직 번역 안 된 게 확정된 키는 위 테스트 담당
    const bad = untranslatedWordsForKey(k, S.t[k]);
    if (bad.length) offenders.push(k + ": " + bad.join(", "));
  });
  assert.deepEqual(offenders, [],
    "번역되다 만 문자열 " + offenders.length + "건(키: 남은 라틴 단어) —\n" + offenders.join("\n"));
});

test("지표명은 계속 영어다 — 인터페이스 언어와 무관하다는 명시 규칙", () => {
  const bad = Object.keys(S.IND).filter(k => /[가-힣]/.test(String(S.IND[k])));
  assert.deepEqual(bad, [], "한글이 섞인 지표명: " + bad.join(", "));
});

test("시안에 문자 그대로 있는 5종 이름은 바꾸지 않는다", () => {
  assert.equal(S.ind("ma"), "Moving average");
  assert.equal(S.ind("macd"), "MACD");
  assert.equal(S.ind("rsi"), "RSI");
  assert.equal(S.ind("bollinger"), "Bollinger");
  assert.equal(S.ind("volume"), "Volume");
});

// CURATED(ticker-picker.js) 는 회사명 데이터다 — UI 문구가 아니다. 그 파일 자신의 주석이
// "이 컴포넌트가 이름을 아는 유일한 지점"이라고 못박고 있고, strings.js 에 옮기면 두 벌이
// 갈린다(카드추가 항목 1). 그래서 한글 리터럴 금지 스캔에서만 그 배열을 뺀다 — 존재하지
// 않는 MSStr 키 참조 검사(badKeys)는 이 파일에도 그대로 적용된다(CURATED 와 무관한 별개 검사).
//
// readings.js(태스크 8 에서 합류)는 30여 개 SAY 함수가 조각을 이어붙여 문장을 **조립**한다 —
// 거절문 3종만 strings.js 를 거치고(rdNotEnoughBars 등), 나머지는 원래도 영문 조각을 함수
// 안에 직접 들고 있었다(구조 자체는 이 태스크가 만들지 않았다, 번역만 했다). 그 조각 하나하나를
// strings.js 키로 쪼개면 150개 넘는 마이크로 키가 생겨 "조각 경계는 그대로 둔다"는 태스크 8
// 지시와 정면으로 충돌한다 — CURATED 와 같은 이유(데이터/조립 corpus지 UI 카피가 아니다)로
// 여기서도 뺀다. 대신 readings.js 전용 게이트(아래 "readings.js 의 판독 문장에 남은 영어가
// 없다")가 이 파일의 번역 완결성을 따로 지킨다 — "한글 금지"가 아니라 "영어 잔존 금지"로
// 방향이 뒤집힌 자기 몫의 관문이다.
const DATA_LITERAL_FILES = ["../www/ticker-picker.js", "../www/readings.js"];

// 리터럴 스캔의 대상은 **화면을 조립하는 파일**이다. 죽은 키 스캔(KEY_SCAN_FILES)이 www 전체를
// 훑도록 넓혀지면서 캔버스 드로잉 파일들이 딸려 들어왔고, 거기 박힌 축 라벨("1차"·"개월"·"봉")이
// 새로 걸렸다. 그것들은 별개 사안이다 — 캔버스에 그리는 짧은 라벨을 문자열 파일로 뺄지는
// 이 관문이 아니라 사람이 정할 일이고, 여기서 함께 빨갛게 만들면 두 문제가 뭉쳐 둘 다 안 고쳐진다.
// 그래서 **두 검사의 범위를 나눈다**: 죽은 키는 넓게(못 보는 파일이 없어야 하므로),
// 리터럴은 화면 조립 파일만.
// 리터럴 스캔의 대상은 **화면을 조립하는 파일**이고, 그 목록은 넓히면 안 된다. 죽은 키 스캔이
// www 전체로 넓어졌을 때 이 검사까지 같이 넓혔더니 strings.js 자신(리터럴 덩어리)과 데이터
// 파일(store.js 의 회사명, ind-tiers.js 의 성향 이름, report-model.js 의 주기명), 캔버스 축
// 라벨("1차"·"개월"·"봉")이 전부 걸렸다. 그것들은 각각 별개 사안이고, 여기서 함께 빨갛게
// 만들면 문제 넷이 뭉쳐 넷 다 안 고쳐진다.
//
// **두 검사의 범위는 서로 다른 이유로 정해진다**: 죽은 키는 못 보는 파일이 없어야 하므로 넓게,
// 리터럴은 "이 파일의 한글은 strings.js 에서 와야 한다"고 정한 파일만.
const LITERAL_SCAN_FILES = ["../www/screens/report.js", "../www/screens/watchlist.js", "../www/screens/wallet.js",
                            "../www/draw-layers.js", "../www/chart-legend.js", "../www/draw-panels.js", "../www/app.js",
                            "../www/tier-sheet.js", "../www/readings.js", "../www/ticker-picker.js",
                            "../www/screens/onboarding.js", "../www/screens/readings-list.js",
                            "../www/screens/expert.js", "../www/blocked.js",
                            // 진행 장면 둘. rv* 는 8b, an* 는 19a 에서만 소비된다 — 규칙이 반대인
                            // 두 모듈이라 파일도 둘이고, 여기서도 둘 다 적는다.
                            "../www/progress-reveal.js", "../www/progress-analyze.js"];

test("화면 소스에 문자열 리터럴이 박혀 있지 않다 — 한글이든 영문 문장이든", () => {
  const offenders = [];
  // Step 5 carry-forward: 한글 부재만으로는 오타(MSStr.t.존재하지않는키 → undefined 렌더)를 못 잡는다.
  // 같은 소스 스캔 김에 참조된 MSStr 키가 전부 strings.js 에 실존하는지도 확인한다(소스 스캔 방식 보강).
  const badKeys = [];
  for (const f of LITERAL_SCAN_FILES) {
    const src = readFileSync(new URL(f, import.meta.url), "utf8");
    const skipKorean = DATA_LITERAL_FILES.indexOf(f) >= 0;
    src.split("\n").forEach((line, i) => {
      const code = line.replace(/\/\/.*$/, "").replace(/\/\*[\s\S]*?\*\//g, "");
      const m = code.match(/(["'`])(?:(?!\1)[^\\]|\\.)*\1/g) || [];
      if (!skipKorean) {
        m.filter(s => /[가-힣]/.test(s))
         .forEach(s => offenders.push(f.replace("../", "") + ":" + (i + 1) + "  " + s));
      }
      let km;
      while ((km = KEY_RE.exec(code))) {
        if (!(km[1] in S.t)) badKeys.push(f.replace("../", "") + ":" + (i + 1) + "  " + km[1]);
      }
    });
  }
  assert.deepEqual(offenders, [], "한글 UI 문자열 " + offenders.length + "건:\n" + offenders.join("\n"));
  assert.deepEqual(badKeys, [], "존재하지 않는 MSStr 키 참조 " + badKeys.length + "건:\n" + badKeys.join("\n"));
});

// ── screens/ 소스에 남은 영어 — 위 테스트의 반대쪽 구멍 ──────────────────────────────────
// 바로 위 테스트 제목은 "한글이든 영문 문장이든"이지만 본문(offenders)은 한글 존재 여부만
// 본다 — 영문 문장은 한글이 하나도 없으니 그물을 그냥 통과한다. MSUi.el("div","w-sub",
// "Balance updates may take a few minutes.") 를 screens/wallet.js 에 추가해도, var
// RETRY_LABEL = "Retry scan" 을 screens/watchlist.js 에 추가해도 위 테스트는 그대로 초록이다.
// readings.js 가 이미 겪은 것과 같은 모양의 구멍이라 처방도 같다 — strings.js 값 검증에 쓰는
// untranslatedWords() 를 그대로 재사용해 한 허용목록이 모든 곳을 다스리게 한다.
//
// 대상은 www/screens/ 폴더로 좁힌다(KEY_SCAN_FILES 의 부분집합). draw-layers.js·chart-legend.js·
// draw-panels.js 는 캔버스에 헥스 색상·rgba·font 축약 지정을 리터럴로 잔뜩 박아두는 완전히
// 다른 성격의 파일이다(그리기 파라미터지 문장이 아니다) — 같은 잣대를 대면 실측 100건 넘게
// 오탐이 쏟아진다. readings.js 처럼 그 영역은 자기 몫의 게이트가 따로 필요하지 이번 파인딩의
// 대상이 아니다(파인딩 원문 예시 둘 다 screens/ 안에서 나왔다).
const SCREENS_FILES = LITERAL_SCAN_FILES.filter(f => f.indexOf("/screens/") >= 0);

// "코드 토큰" 모양 — 문장이 아니라 CSS 클래스 조각·선택자·커스텀 프로퍼티·인라인 스타일
// 선언인 리터럴들의 공통 형태다: 앞에 공백·점·대시·언더스코어가 붙을 수 있고(삼항연산자로
// 이어붙이는 클래스 접미사 " on"·CSS 선택자 ".wl-chip"·커스텀 프로퍼티 "--gold" 등), 그
// 뒤로는 소문자·숫자·코드 구두점(- _ . / : ; % ( ))만 온다. 대문자나 내부 공백이 하나라도
// 있으면 이 모양이 아니다 — 진짜 문장은 대문자로 시작하고 공백으로 단어를 가른다(실측:
// " on"·" is-full"·".wl-chip"·"--gold"·"display:inline-block;width:88px;height:12px;" 등
// 37건이 이 한 규칙으로 걸러진다).
const CODE_TOKEN_RE = /^[ .\-_]*[a-z0-9][a-z0-9_./:;%()-]*$/;

// 비교 피연산자(===/!==/==/!=) 바로 다음의 문자열 리터럴 — readings.js 게이트(위 아래 참고)가
// 이미 쓰는 판단을 그대로 가져온다. key === "US" 는 내부 키 대조일 뿐 화면에 안 나간다.
function isComparisonOperand(before) { return /(===|!==|==|!=)\s*$/.test(before); }

// 내부 식별자 자리 — 비교 피연산자와 **같은 종류**다(화면에 안 나가는 조회 키). 값이 아니라
// **위치**로 증명된다: `kind: "failedUnknown"` 은 MSBlocked 의 카드 이름이고, 그 이름으로
// 화면에 그려지는 것은 MSStr 을 거친 문구다. 열거가 아니라 모양이라, 새 카드가 생겨도
// 목록을 늘릴 필요가 없다(P1 판정 P·L 의 원칙 — 이름을 세지 말고 구조를 단정한다).
const KEY_PROPS = ["kind", "blockType", "runType", "op", "reason"];
// 이 목록은 **면제 통로**다. 늘리는 것은 "이 자리 문자열은 화면에 안 나간다"는 주장이고,
// 그 주장이 틀리면 미번역 문구가 조용히 샌다. 변이 검증에서 text·label·title 을 넣어도
// 오늘은 피해자가 없어 초록이 나오는 걸 봤다 — 오늘 안 걸린다는 것이 안전하다는 뜻은 아니다.
// 그래서 목록 자체에 래칫을 건다(MAX_PENDING_EN 과 같은 장치).
test("내부 키 면제 목록은 늘어나지 않는다 — 늘리는 건 리뷰가 볼 결정이다", () => {
  assert.deepEqual(KEY_PROPS.slice().sort(), ["blockType", "kind", "op", "reason", "runType"],
    "면제 목록이 바뀌었다: " + KEY_PROPS.join(", ") + " — 정말 필요하면 이 단정도 함께 고치고 사유를 적을 것");
  // 화면 문구를 담는 이름은 절대 들어오면 안 된다 — 그 자리가 곧 렌더되는 값이다.
  ["text", "label", "title", "head", "body", "name", "desc", "msg"].forEach(n =>
    assert.ok(KEY_PROPS.indexOf(n) < 0, "화면 문구 자리(" + n + ")를 면제 목록에 넣었다"));
});
// console.warn/error/log 의 인자는 **화면이 아니다.** 개발자가 읽는 진단이고, 영어인 편이
// 스택트레이스·이슈 검색과 맞는다. 위치로 증명된다는 점에서 isComparisonOperand 와 같은 종류다.
// (이 예외가 생긴 계기: 네트워크 실패 시 브라우저의 "Failed to fetch" 가 화면에 그대로 떠서
// 그걸 콘솔로 내리고 화면엔 번역 문구를 냈더니, 그 콘솔 접두가 이 관문에 걸렸다.)
function isConsoleArg(before) { return /console\.[a-z]+\s*\([^)]*$/.test(before); }

function isInternalKeyProp(before) {
  return new RegExp("(?:^|[^\\w])(?:" + KEY_PROPS.join("|") + ")\\s*:\\s*$").test(before);
}

// MSGlobals.define("Name", ...) 의 1번째 인자는 전역 변수 이름이지 화면 문구가 아니다 —
// globals.js(2026-08-18) 도입으로 등록이 `root.X = ...` 대입에서 이 호출로 바뀌면서, 그동안
// 코드에 안 보이던 전역 이름이 문자열 리터럴로 노출돼 이 게이트에 새로 걸리게 됐다.
// isConsoleArg 와 같은 종류의 예외 — 내용이 아니라 호출 위치로 화면 문구가 아님이 증명된다.
function isMSGlobalsDefineArg(before) { return /MSGlobals\.define\(\s*$/.test(before); }

// 어느 모양 규칙에도 안 걸리는 극소수 개별 예외. 근거 없이 추가하는 것은 금지 — 항목마다
// 왜 화면에 안 나가는지 적는다.
const SCREENS_LITERAL_EXCEPTIONS = new Set([
  "SAMPLE"   // screens/onboarding.js SAMPLE_SEED — MSPredDraw 난수 씨앗 식별자일 뿐, 화면에 렌더되지 않는다
]);

// MSUi.el(tag, class, ...) 의 리터럴 1·2번째 인자, 그리고 `.className = "..."` 대입의 우변 —
// 둘 다 여러 클래스를 공백으로 이어붙일 수 있어("btn btn-ghost ob-retry") CODE_TOKEN_RE 의
// "공백 없음" 조건을 못 넘는다. 하지만 이 값들은 **위치**(구문상 역할)로 이미 클래스임이
// 증명된다 — 파인딩이 명시한 "el() 의 첫 인자는 태그, 둘째는 클래스" 원칙을 코드로 옮긴 것.
// 내용이 아니라 위치로 뺀다는 점에서 CODE_TOKEN_RE(내용 모양)와 상보적이다.
function collectShapeExcludedValues(src) {
  const out = new Set();
  const elRe = /MSUi\.el\s*\(\s*(["'])((?:(?!\1)[^\\]|\\.)*)\1(?:\s*,\s*(["'])((?:(?!\3)[^\\]|\\.)*)\3)?/g;
  let m;
  while ((m = elRe.exec(src))) { out.add(m[2]); if (m[4] != null) out.add(m[4]); }
  const clsRe = /\.className\s*=\s*(["'])((?:(?!\1)[^\\]|\\.)*)\1/g;
  while ((m = clsRe.exec(src))) out.add(m[2]);
  return out;
}

// 소스 텍스트 하나를 스캔해 남은 영어 리터럴을 돌려준다. 디스크의 실제 파일뿐 아니라
// 아래 재현 테스트가 만드는 합성 소스 조각에도 그대로 쓴다 — 검사 로직이 파일 읽기와
// 분리돼 있어야 "주입 문자열이 실제로 빨간불을 켜는가"를 파일을 더럽히지 않고 증명할 수 있다.
function scanSrcForEnglish(src, label) {
  const shapeExcluded = collectShapeExcludedValues(src);
  const out = [];
  src.split("\n").forEach((line, i) => {
    const code = line.replace(/\/\/.*$/, "").replace(/\/\*[\s\S]*?\*\//g, "");
    const re = /(["'`])(?:(?!\1)[^\\]|\\.)*\1/g;
    let m;
    while ((m = re.exec(code))) {
      const inner = m[0].slice(1, -1);
      if (inner === "use strict") continue;                          // 모듈 보일러플레이트
      if (shapeExcluded.has(inner)) continue;                        // el() 태그/클래스·className 대입
      var before = code.slice(0, m.index);
      if (isComparisonOperand(before)) continue;                       // 내부 키 대조
      if (isInternalKeyProp(before)) continue;                         // kind:/runType: 등 조회 키
      if (isConsoleArg(before)) continue;                              // console.* 인자 — 화면이 아니다
      if (isMSGlobalsDefineArg(before)) continue;                      // MSGlobals.define("Name", ...) 의 이름 인자
      if (CODE_TOKEN_RE.test(inner)) continue;                       // CSS 조각/선택자/커스텀 프로퍼티
      if (SCREENS_LITERAL_EXCEPTIONS.has(inner)) continue;           // 개별 예외
      const words = untranslatedWords(inner);
      if (words.length) out.push({ file: label, line: i + 1, text: inner, words });
    }
  });
  return out;
}

function screensLiteralOffenders(f) {
  const src = readFileSync(new URL(f, import.meta.url), "utf8");
  return scanSrcForEnglish(src, f.replace("../", ""));
}

test("screens/ 화면 소스에 남은 영어가 없다 — 한글 부재만 보던 반대쪽 구멍을 닫는다", () => {
  const bad = [];
  SCREENS_FILES.forEach(f => { bad.push.apply(bad, screensLiteralOffenders(f)); });
  assert.deepEqual(bad, [],
    "screens/ 에 남은 영어 " + bad.length + "건:\n" +
    bad.map(o => o.file + ":" + o.line + "  " + JSON.stringify(o.text) + "  (" + o.words.join(", ") + ")").join("\n"));
});

// 위 게이트가 실제로 뭔가를 잡는지 증명한다 — readings.js 재현 테스트와 같은 원칙(태스크 8
// 코디네이터 지시: 재현→빨강을 보여줄 것). 파인딩 원문의 두 예시 문자열을 그대로 쓴다.
test("screens/ 영어잔존 게이트는 실제로 잡는다 — wallet·watchlist 주입 예시로 재현", () => {
  const leak1 = 'MSUi.el("div", "w-sub", "Balance updates may take a few minutes.");';
  const leak2 = 'var RETRY_LABEL = "Retry scan";';
  assert.ok(scanSrcForEnglish(leak1, "synthetic").length > 0,
    "MSUi.el 3번째 인자(콘텐츠)의 영문 문장을 못 잡았다");
  assert.ok(scanSrcForEnglish(leak2, "synthetic").length > 0,
    "변수에 담긴 영문 문장을 못 잡았다");
  // 위 예시들은 복사본에만 적용했다 — 실제 파일들은 여전히 깨끗해야 한다.
  const clean = [];
  SCREENS_FILES.forEach(f => { clean.push.apply(clean, screensLiteralOffenders(f)); });
  assert.deepEqual(clean, [], "재현 전에 이미 screens/ 원본이 더럽다: " + JSON.stringify(clean));
});

// ── 캔버스에 그려지는 텍스트 — screens/ 게이트가 못 보는 세 번째 구멍 ──────────────────────
// 위 SCREENS_FILES 게이트는 draw-layers.js·chart-legend.js·draw-panels.js 를 통째로 뺐다(주석
// 참고 — 헥스 색상·rgba·font 축약이 리터럴로 잔뜩 박혀 있어 파일 전체를 훑으면 100건 넘는
// 오탐이 나온다). 그런데 이 파일들이 실제로 화면(캔버스)에 글자를 그린다 — MA/Bollinger 투영
// 배지("MA projection ≈ …"·"Bollinger midline projection")가 그 구멍으로 새 나갔다(파인딩
// 원문). 파일을 통째로 빼는 대신 **모양으로 좁힌다**: 캔버스에 실제로 텍스트를 그리는 두
// 지점 — `_evLabel(...)` 의 text 인자(2번째)와 `c.fillText(...)` 의 text 인자(1번째) — 만
// 본다. 색상·정렬("right"/"left")·폰트 축약은 다른 인자 자리에 있으니 애초에 후보에 안 든다.
// untranslatedWords() 를 그대로 재사용해 허용 목록이 하나로 유지되게 한다(screens/ 게이트와
// 동일 원칙).
const CANVAS_SCAN_ROOT = fileURLToPath(new URL("../www/", import.meta.url));

// 캔버스 국소 허용 라틴 — readings.js 의 READINGS_ALLOWED_LATIN 과 같은 방식이다(전역은 안
// 건드린다). 여기 있는 표기들은 strings.js 어디에도 안 나오고 draw-layers.js 캔버스 배지에만
// 있으므로, 전역 ALLOWED_LATIN 에 넣으면 UI 문구 게이트까지 같이 헐거워진다 — 특히 한 글자
// "B" 를 전역에 넣으면 앞으로 UI 카피에 홀로 남은 "B" 가 영원히 안 잡힌다.
const CANVAS_ALLOWED_LATIN = [
  "BB",       // _drawBollingerLayers 의 "BB "+상태 배지 — Bollinger Bands 표준 축약형
  "B",        // 같은 배지의 "%B" — readings.js 의 %K/%D/%B 허용과 같은 이유
].map(w => w.toLowerCase());
const CANVAS_ALLOWED_SET = new Set(CANVAS_ALLOWED_LATIN);
function canvasUntranslatedWords(v) {
  return untranslatedWords(v).filter(w => !CANVAS_ALLOWED_SET.has(w.toLowerCase()));
}

// www/** 전부를 훑는다(vendor/ 는 sync-engine 이 만드는 생성물이라 제외 — 커밋되지 않고
// 로컬 sync 여부에 따라 존재가 갈려 게이트가 불안정해진다. map/CLAUDE.md 의 vendor 규율과 같다).
function collectJsFiles(dir) {
  const out = [];
  readdirSync(dir).forEach(name => {
    if (name === "vendor") return;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push.apply(out, collectJsFiles(full));
    else if (name.endsWith(".js")) out.push(full);
  });
  return out;
}
const CANVAS_SCAN_FILES = collectJsFiles(CANVAS_SCAN_ROOT);

// 호출 하나의 top-level 인자들을 콤마 기준으로 쪼갠다 — 중첩 괄호/대괄호/중괄호와 문자열
// 내부의 콤마는 무시한다("BB " + sTxt + (bb.squeeze ? … : "") + … 처럼 인자 하나가 삼항·중첩
// 호출을 포함해도 안 갈린다). openParenIdx = 여는 "(" 바로 다음 인덱스.
function splitTopLevelArgs(src, openParenIdx) {
  let depth = 0, cur = "", inStr = null;
  const args = [];
  for (let i = openParenIdx; i < src.length; i++) {
    const ch = src[i];
    if (inStr) {
      cur += ch;
      if (ch === "\\") { i++; if (i < src.length) cur += src[i]; continue; }
      if (ch === inStr) inStr = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") { inStr = ch; cur += ch; continue; }
    if (ch === "(" || ch === "[" || ch === "{") { depth++; cur += ch; continue; }
    if (ch === ")" || ch === "]" || ch === "}") {
      if (ch === ")" && depth === 0) { args.push(cur); return args; }
      depth--; cur += ch; continue;
    }
    if (ch === "," && depth === 0) { args.push(cur); cur = ""; continue; }
    cur += ch;
  }
  return args;   // 괄호가 안 닫혔다 — 비정상 소스, 있는 대로 돌려준다
}

// 비교 피연산자("bull"/"bear"/"support" 등 내부 키 대조 — 실제로 그려지는 값은 그 분기가
// 고르는 Str.MA_ALIGN.bull 같은 조회값이지 이 리터럴 자체가 아니다)는 screens/ 게이트와 같은
// isComparisonOperand() 로 제외한다. 화면에 안 나가는 문자열까지 잡으면 이 게이트가 무의미해진다.
function literalsIn(str) {
  const out = [];
  const re = /(["'`])(?:(?!\1)[^\\]|\\.)*\1/g;
  let m;
  while ((m = re.exec(str))) {
    if (isComparisonOperand(str.slice(0, m.index))) continue;
    out.push(m[0].slice(1, -1));
  }
  return out;
}

// 리터럴 안 \xHH/\uHHHH 이스케이프(예: 가운뎃점 "\xb7")는 실제로 렌더링되면 글자가 아니라
// 기호가 된다 — 소스 텍스트를 그대로 읽는 이 스캐너는 escape 를 해석하지 않으므로, 안 지우면
// "\xb7" 의 "b"+"7"경계에서 "xb" 가 라틴 단어로 오탐된다.
function stripHexEscapes(v) { return String(v).replace(/\\x[0-9a-fA-F]{2}/g, " ").replace(/\\u[0-9a-fA-F]{4}/g, " "); }

// _evLabel(c, text, x, y, color, align, force) → text 는 2번째(index 1).
// c.fillText(text, x, y[, maxWidth]) → text 는 1번째(index 0).
// `function _evLabel(...)` 선언 자체는 호출이 아니라 건너뛴다.
const CANVAS_CALL_RE = /(function\s+)?(_evLabel|\.fillText)\(/g;

function canvasTextOffenders(label, src) {
  const out = [];
  CANVAS_CALL_RE.lastIndex = 0;
  let m;
  while ((m = CANVAS_CALL_RE.exec(src))) {
    if (m[1]) continue;   // function _evLabel( 선언 — 호출 아님
    const argIdx = m[2] === "_evLabel" ? 1 : 0;
    const args = splitTopLevelArgs(src, m.index + m[0].length);
    const argStr = args[argIdx];
    if (argStr == null) continue;
    const line = src.slice(0, m.index).split("\n").length;
    literalsIn(argStr).forEach(text => {
      if (text === "use strict") return;
      const words = canvasUntranslatedWords(stripHexEscapes(text));
      if (words.length) out.push({ file: label, line, text, words });
    });
  }
  return out;
}

function canvasFileOffenders(f) {
  return canvasTextOffenders(f.replace(CANVAS_SCAN_ROOT, "www/"), readFileSync(f, "utf8"));
}

test("캔버스에 그려지는 텍스트(_evLabel·fillText)에 남은 영어가 없다 — screens/ 게이트의 사각지대", () => {
  const bad = [];
  CANVAS_SCAN_FILES.forEach(f => { bad.push.apply(bad, canvasFileOffenders(f)); });
  assert.deepEqual(bad, [],
    "캔버스 텍스트에 남은 영어 " + bad.length + "건:\n" +
    bad.map(o => o.file + ":" + o.line + "  " + JSON.stringify(o.text) + "  (" + o.words.join(", ") + ")").join("\n"));
});

// 위 게이트가 실제로 잡는지 증명한다 — 파인딩 원문의 두 지점을 그대로 재현한다.
// 색상·정렬 인자는 건드리지 않는다는 것도 함께 증명한다(그 자리 텍스트는 English 라도 안 잡혀야
// "모양으로 좁혔다"는 설계가 성립한다).
test("캔버스 텍스트 게이트는 실제로 잡는다 — MA·Bollinger 투영 두 지점 재현·원복 왕복 증명", () => {
  const leakMA = '_evLabel(c, "MA projection ≈ " + _hzFmt(endV), xr, pToY(endV), _maCol, "right");';
  const leakBB = 'c.fillText("Bollinger midline projection", x, y);';
  assert.ok(canvasTextOffenders("synthetic", leakMA).length > 0,
    "_evLabel 의 text 인자(2번째)에 있는 영문 문장을 못 잡았다");
  assert.ok(canvasTextOffenders("synthetic", leakBB).length > 0,
    "fillText 의 text 인자(1번째)에 있는 영문 문장을 못 잡았다");
  // 색상·정렬 인자는 English 여도 안 잡힌다(모양으로 좁혔다는 설계의 반대쪽 증명).
  const shapeOnly = '_evLabel(c, safeVar, xr, y, "#46c28e", "right");';
  assert.deepEqual(canvasTextOffenders("synthetic", shapeOnly), [],
    "색상/정렬 인자가 오탐으로 잡혔다 — 모양 스코프가 새고 있다");
  // 다른 draw 파일에 새 fillText 가 추가돼도 잡는다(파인딩의 "다른 draw 파일" 요구 — draw-layers.js
  // 가 아닌 임의 위치를 라벨로 준다).
  const otherDrawFile = 'c.fillText("New spike marker", x, y);';
  assert.ok(canvasTextOffenders("draw-panels.js(synthetic)", otherDrawFile).length > 0,
    "draw-layers.js 가 아닌 다른 draw 파일의 fillText 영문을 못 잡았다");
  // 캔버스 국소 허용(BB·%B)은 캔버스 게이트 안에서만 산다 — UI 문구 게이트까지 헐거워지면
  // 이 국소 목록을 따로 둔 의미가 없다(전역에 넣었다가 되돌린 지점).
  assert.deepEqual(canvasTextOffenders("synthetic", 'c.fillText("BB " + s + " · %B" + v, x, y);'), [],
    "캔버스 국소 허용 축약형(BB·%B)이 오탐으로 잡혔다");
  assert.ok(untranslatedWords("B 등급").length > 0,
    "전역 UI 문구 게이트가 홀로 남은 'B' 를 흘려보낸다 — 캔버스 국소 허용이 전역으로 샜다");
  assert.ok(untranslatedWords("BB 밴드").length > 0,
    "전역 UI 문구 게이트가 'BB' 를 흘려보낸다 — 캔버스 국소 허용이 전역으로 샜다");
  // 위 예시들은 합성 소스에만 적용했다 — 실제 파일들은 여전히 깨끗해야 한다.
  const clean = [];
  CANVAS_SCAN_FILES.forEach(f => { clean.push.apply(clean, canvasFileOffenders(f)); });
  assert.deepEqual(clean, [], "재현 전에 이미 캔버스 텍스트가 더럽다: " + JSON.stringify(clean));
});

// Fix 5: spec §8이 요구한 미사용 키 가드. 위 테스트가 "참조된 키가 실존하는가"를 보는 반대쪽 —
// "존재하는 키가 실제로 참조되는가"를 본다. wlAddBtn·rpMissingPoint 처럼 목업에서 옮겨놓고
// 배선을 안 한 죽은 문구가 strings.js 에 계속 쌓이는 것을 막는다.
test("MSStr.t 의 모든 키는 화면 소스에서 최소 한 번 참조된다 — 죽은 문구가 조용히 쌓이지 않는다", () => {
  const referenced = new Set();
  for (const f of KEY_SCAN_FILES) {
    const src = readFileSync(new URL(f, import.meta.url), "utf8");
    src.split("\n").forEach(line => {
      const code = line.replace(/\/\/.*$/, "").replace(/\/\*[\s\S]*?\*\//g, "");
      let km;
      while ((km = KEY_RE.exec(code))) referenced.add(km[1]);
    });
  }
  const unused = Object.keys(S.t).filter(k => !referenced.has(k));
  assert.deepEqual(unused, [], "참조되지 않는 MSStr.t 키 " + unused.length + "건: " + unused.join(", "));
});

// 같은 단계를 시트·리포트에서는 "Full", 지갑·온보딩에서는 "Deep analysis" 로 부르고 있었다.
// 이 테스트가 없었기 때문에 두 이름이 갈렸고, 3단계 체계에서 "Full" 위에 전문분석이 오면
// 말 자체가 성립하지 않는다.
test("한 단계는 한 이름으로 불린다", () => {
  const raw = [S.t.tsFull, S.t.rpTierFull, S.t.walDeep, S.t.obCostFull];
  const names = ["tsFull", "rpTierFull", "walDeep", "obCostFull"];
  // 넷 중 하나라도 지워지면 String(undefined)="undefined" 가 넷 다 같아져 uniq.length===1 로
  // 통과해버린다(전부 유실인데 초록) — 값 자체를 먼저 검증해야 이 함정을 막는다.
  raw.forEach((v, i) => {
    assert.ok(typeof v === "string" && v.length > 0,
      names[i] + " 값이 비어 있다(키가 지워졌을 수 있다): " + JSON.stringify(v));
  });
  const deep = raw.map(s => String(s).toLowerCase());
  const uniq = Array.from(new Set(deep.map(s => s.replace(/\s*(분석|analysis)\s*$/, "").trim())));
  assert.equal(uniq.length, 1, "심화분석이 여러 이름으로 불린다: " + JSON.stringify(deep));
});

// 재스킨은 마크업을 통째로 다시 쓴다. 시안(14a)이 그리지 않은 상태(빈 목록·검색 결과 없음·
// 스캔 중·스캔 실패)가 그 과정에 조용히 사라지는 것을 막는다 — 시안에 없다는 것은
// "지워도 된다"가 아니라 "그려지지 않았다"는 뜻이다. 실제 키 이름은 www/strings.js 를 확인해
// 채웠다(wlEmptyHint 같은 별도 힌트 키는 없다 — wlEmpty 하나가 줄바꿈으로 본문+힌트를 겸한다).
test("시안에 없는 워치리스트 상태 문구가 재스킨 후에도 살아 있다", () => {
  const gone = ["wlEmpty", "wlNoMatch", "wlScanning", "wlScanFail"]
    .filter(k => !(S.t[k] && String(S.t[k]).length));
  assert.deepEqual(gone, [], "사라진 상태 문구: " + gone.join(", "));
});

// 8b·8c·8d 세 라운드가 쌓아온 실패·경계 문구다. 재스킨이 마크업을 다시 쓰면서
// 이 분기들이 함께 쓸려나가는 것이 이 태스크의 가장 큰 위험이다.
test("지갑의 상태 문구가 재스킨 후에도 전부 살아 있다", () => {
  const gone = ["walUnavailable", "wMerged", "walCapped", "adPending", "adCooldown",
                "adDailyDone", "adLowBalance", "adFailed", "walNoCashValue", "walEngine"]
    .filter(k => !(S.t[k] && String(S.t[k]).length));
  assert.deepEqual(gone, [], "사라진 지갑 상태 문구: " + gone.join(", "));
});

// ── readings.js 는 PENDING_EN 의 사각지대였다 ──────────────────────────────────────────
// PENDING_EN 은 MSStr.t 만 본다. readings.js 의 30여 개 SAY 판독 함수는 자기 안에서 문장을
// 통째로 조립하는 별도 corpus라 그 목록에 잡히지 않았고, 화면 리터럴 스캔(위 KEY_SCAN_FILES
// 테스트)은 "한글이 있는가"만 보지 "영어가 남았는가"는 안 봐서 반대 방향 누락을 못 잡았다 —
// PENDING_EN=0 인데 report.js:635(REASONING 32행)가 여전히 영어를 그리는 구멍이 이래서 생겼다
// (태스크 8 코디네이터 지적). 여기서 그 구멍을 닫는다 — strings.js 값에 쓴 것과 **같은**
// untranslatedWords() 를 readings.js 의 소스 문자열 리터럴에 그대로 적용한다.
//
// "===" 비교 피연산자("golden"·"bull"·"up" 등, engine 이 주는 내부 키와 대조만 하고 화면에
// 안 나간다)는 제외한다 — 안 그러면 진짜 화면 문구가 아닌 것까지 잡아 이 테스트가 무의미해진다.
const READINGS_PATH = new URL("../www/readings.js", import.meta.url);
const READINGS_SRC = readFileSync(READINGS_PATH, "utf8");

// readings.js 국소 허용 라틴 — 국내 차트 앱도 그대로 쓰는 지표 표기다. 전역 ALLOWED_LATIN 과
// 합쳐서 쓴다(전역 쪽은 건드리지 않는다 — 이 표기들은 strings.js 어디에도 안 나온다).
const READINGS_ALLOWED_LATIN = [
  "DI",       // adx() "+DI"/"-DI" — 방향성 지표(Directional Indicator), 국내 앱도 그대로 쓴다
  "K", "D",   // stochastic() "%K"/"%D" — 스토캐스틱 표준 표기
  "B",        // bollinger() "%B" — 볼린저 %B 표준 표기
  "pattern",  // pattern() 의 Str.ind("pattern") 인자 — blockType 조회 키일 뿐 화면 문구가 아니다
].map(w => w.toLowerCase());
const READINGS_ALLOWED_SET = new Set([...ALLOWED_LATIN, ...READINGS_ALLOWED_LATIN]);
function readingsUntranslatedWords(v) {
  return latinWords(stripPlaceholders(stripIndicatorNames(v))).filter(w => !READINGS_ALLOWED_SET.has(w.toLowerCase()));
}

// 모듈 보일러플레이트(require 경로·"use strict")는 화면 문구가 아니다 — 통째로 제외한다.
function isBoilerplate(v) { return v === "use strict" || /^\.\.?\//.test(v) || /\.js$/.test(v); }

function readingsLiterals(src) {
  const out = [];
  src.split("\n").forEach((line, i) => {
    const code = line.replace(/\/\/.*$/, "");
    const re = /(["'])(?:(?!\1)[^\\]|\\.)*\1/g;
    let m;
    while ((m = re.exec(code))) {
      const before = code.slice(0, m.index);
      if (/(===|!==|==|!=)\s*$/.test(before)) continue;   // 비교 피연산자 — 화면에 안 나간다
      if (isMSGlobalsDefineArg(before)) continue;         // MSGlobals.define("Name", ...) 의 이름 인자
      const text = m[0].slice(1, -1);
      if (isBoilerplate(text)) continue;
      out.push({ line: i + 1, text });
    }
  });
  return out;
}

test("readings.js 의 판독 문장에 남은 영어가 없다 — PENDING_EN 사각지대를 닫는다", () => {
  const bad = readingsLiterals(READINGS_SRC)
    .map(o => ({ ...o, words: readingsUntranslatedWords(o.text) }))
    .filter(o => o.words.length);
  assert.deepEqual(bad, [],
    "readings.js 에 남은 영어 " + bad.length + "건:\n" +
    bad.map(o => o.line + ": " + JSON.stringify(o.text) + "  (" + o.words.join(", ") + ")").join("\n"));
});

// 위 테스트가 실제로 뭔가를 잡는지 증명한다 — 회귀 없이 통과만 하는 껍데기 테스트가 아니라는
// 증거(태스크 8 코디네이터 지시: 재현→빨강→원복→초록을 보여줄 것).
test("readings.js 게이트는 실제로 영어를 잡는다 — 재현·원복 왕복 증명", () => {
  const withLeak = READINGS_SRC.replace(
    '", 교차 없음"',
    '", no crossover in range"'   // 의도적으로 되돌린 영문 — 이 줄만 있으면 빨강이어야 한다
  );
  assert.notStrictEqual(withLeak, READINGS_SRC, "치환 대상 문자열을 못 찾았다 — 테스트 자체가 무의미해졌다");
  const leaked = readingsLiterals(withLeak)
    .map(o => ({ ...o, words: readingsUntranslatedWords(o.text) }))
    .filter(o => o.words.length);
  assert.ok(leaked.length > 0, "영어를 재도입했는데 게이트가 못 잡았다 — 게이트가 무력하다");
  // 원본(READINGS_SRC, 디스크의 실제 파일)은 여전히 깨끗해야 한다 — replace() 는 복사본에만 적용된다.
  const clean = readingsLiterals(READINGS_SRC)
    .map(o => ({ ...o, words: readingsUntranslatedWords(o.text) }))
    .filter(o => o.words.length);
  assert.deepEqual(clean, [], "원본 파일 자체가 이미 더럽다 — 재현 전에 이미 실패 상태였다");
});
