import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const S = require("../www/strings.js");
const FC = require("../../forge-core.js");
const G = require("../www/graph.js");

// 키 존재 가드(아래)와 미사용 키 가드(파일 하단)가 같은 목록을 스캔한다 — 한쪽만 갱신하면
// 새 소비 파일의 오타는 잡히는데 죽은 키는 못 잡는(또는 그 반대) 비대칭이 생긴다.
const KEY_SCAN_FILES = ["../www/screens/report.js", "../www/screens/watchlist.js", "../www/screens/wallet.js",
                         "../www/draw-layers.js", "../www/chart-legend.js", "../www/draw-panels.js", "../www/app.js",
                         // readings.js 도 화면에 나가는 문장을 만든다 — 거절문 3종이 여기서만 소비되므로
                         // 목록에서 빠져 있으면 "죽은 키"로 오판되고, 한글 문자열 스캔도 이 파일을 못 본다.
                         "../www/tier-sheet.js", "../www/readings.js",
                         // ticker-picker.js — 온보딩 4단계·워치리스트 ＋Add 가 공유할 종목 고르기.
                         // tp* 키는 이 파일에서만 소비된다(둘 다 아직 안 붙었다).
                         "../www/ticker-picker.js",
                         // screens/onboarding.js — ob* 키는 여기서만 소비된다.
                         // 빠뜨리면 새 문구가 전부 '죽은 키'로 오판된다.
                         "../www/screens/onboarding.js"];
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
const PENDING_EN = ["bootVendorMissing","wlBrandA","wlBrandB","wlChipUS","wlChipKR","wlChipETF","addTitle","rpBack","rpPickSym","rpLoadFail","rpRetry","rpUnknownErr","rpAnalyzeErr","rpBarsShort","rpUp","rpDown","rpFlat","rpBullish","rpBearish","rpCone","rpAgree","rpAgreeTail","rpAgreeShort","rpAgreeNone","rpHitLeadBull","rpHitLeadBear","rpHitRight","rpHitWrong","rpHitScopeA","rpHitScopeB","rpHitScopeC","rpHitScopeShort","rpHitSize","rpHitSizeTail","rpHzTomorrow","rpHzWeek","rpHzMonth","rpTierBasic","rpTierCount","rpTierFull","rpTierCountFull","rpComposite","rpHorizon","rpSignals","rpOf","rpShown","rpNotCounted","rpAgainst","rpAgainstNone","rpReasoning","rpReasoningNodes","rpReasoningScope","rpReasoningDir","rdNotEnoughBars","rdNoVolume","rdNoSwings","rpMissingHitRate","rpMissingDisagree","rpMissingTfAgree","rpMissingWhy","rpMissingNote","rpUp2","rpFlat2","rpDown2","rpTf","rpDaily","rpWeekly","rpMonthly","rpLocked","rpLockedSuffix","rpUpgrade","rpAgreeTf","rpAgreeTfTail","rpNoHistory","pnlRsiEmpty","pnlMacdEmpty","pnlVolumeEmpty","lgP1","lgP2","lgP3","legPred","legTarget","legGolden","legDead","legBars","legNoCross","legSqueeze","cxBullDiv","cxBearDiv","cxBullVolDiv","cxBearVolDiv","walDeep","tsTitle","tsBasic","tsFull","tsCustom","tsBasicDesc","tsFullDesc","tsCustomDesc","tsDone","tsPopular","tsSoon","tsFullPreview","tsCostsLead","tsRun","tsCost","tsShort","tsRunning","tsFailed","tsFailedNoRefund","tsSpendFailed","tsSpendFailedUnknown","tsUnavailable","tpPlaceholder","tpAdd","tpChecking","tpNotFound","tpDidYouMean","tpFull","tpUnavailable","tpAlreadyPicked","tpKept","obBack","obNext","obSampleNote","obH1","obSub1","obH2","obSub2","obCombCap","obH3","obSub3","obGranting","obGranted","obGrantOffline","obRetry","obCostFull","obCostScan","obCostSlot","obH4","obSub4","obH5","obRisk","obAgree","obFree","obFinish"];

// 잔여 목록은 줄어들기만 해야 한다 — 이 상한이 그 규율을 코드로 박아둔다("줄어들기만 한다"는
// 주석 한 줄로는 아무것도 막지 못한다. 태스크 5~8 이 키를 번역해 목록에서 지우면 이 숫자도 함께
// 낮춘다. 숫자를 올리는 건 번역 대신 키를 추가하는 것이므로, 그 자체가 리뷰에서 드러나야 한다.
const MAX_PENDING_EN = 146;

// 값에 라틴문자가 없으면 번역할 단어가 없다 — "↻" · "—" · " · " 같은 기호·구분자다.
// 이것들을 미번역으로 세면 잔여 목록이 절대 비지 않고 태스크 8 의 완료 조건이 도달 불가능해진다.
function needsKo(v) { return /[A-Za-z]/.test(String(v)); }

test("UI 문자열은 한국어다 — 잔여 목록에 적힌 것만 예외", () => {
  const en = Object.keys(S.t).filter(k => needsKo(S.t[k]) && !/[가-힣]/.test(String(S.t[k])));
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

// 허용 라틴 단어 소스 ①: 값에서 지표명 전체 문구를 지운 나머지 — "MACD 교차"·"Volume profile 확인"
// 처럼 문장 속에 지표명이 온전히 섞이는 건 정상이다(브리프의 명시 규칙: 지표명은 언어와 무관하게
// 영어). S.IND 가 바뀌면 이 목록도 같이 파생되므로 손으로 베낄 필요가 없다(hand-copy 금지).
//
// 허용 라틴 단어 소스 ②: 지표명이 아니면서 번역 후에도 영어로 남는 단어. 현재 strings.js 가
// 실제로 담고 있는 문구에 대응해 항목마다 이유를 적는다 — 근거 없이 단어를 여기 넣는 것은
// "번역 안 했다"를 숨기는 뒷문이 된다.
const ALLOWED_LATIN = [
  "ETF", "US", "KR",   // wlChipETF/US/KR — 자산군·국가 코드의 관용 표기, 국문 대응어가 없다
  "Google",            // wSignIn 등 구글 로그인 문구 — 고유명사, 번역하지 않는다
  "MoneyScoop",         // obRisk — 앱 이름 자체, 브랜드명이라 번역하지 않는다
  "TSLA",              // tpPlaceholder 의 예시 종목코드 — 티커는 항상 라틴 표기
  "ID",                // wDeviceClaimed "기기 ID" — 국문 UI 에서도 그대로 쓰는 관용 약어
  "v",                 // walEngine "분석 엔진 v" + 버전 숫자 — semver 접두 "v"는 번역 대상이 아니다
].map(w => w.toLowerCase());
const ALLOWED_LATIN_SET = new Set(ALLOWED_LATIN);

test("번역된 문자열에 남은 라틴 단어는 허용 목록에 있어야 한다 — 절반만 번역한 문구를 잡는다", () => {
  const offenders = [];
  Object.keys(S.t).forEach(k => {
    const v = String(S.t[k]);
    if (!/[가-힣]/.test(v)) return; // 한 글자도 안 옮겨졌으면 PENDING_EN 가드의 몫이다
    const bad = latinWords(stripPlaceholders(stripIndicatorNames(v))).filter(w => !ALLOWED_LATIN_SET.has(w.toLowerCase()));
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

test("화면 소스에 문자열 리터럴이 박혀 있지 않다 — 한글이든 영문 문장이든", () => {
  const offenders = [];
  // Step 5 carry-forward: 한글 부재만으로는 오타(MSStr.t.존재하지않는키 → undefined 렌더)를 못 잡는다.
  // 같은 소스 스캔 김에 참조된 MSStr 키가 전부 strings.js 에 실존하는지도 확인한다(소스 스캔 방식 보강).
  const badKeys = [];
  for (const f of KEY_SCAN_FILES) {
    const src = readFileSync(new URL(f, import.meta.url), "utf8");
    src.split("\n").forEach((line, i) => {
      const code = line.replace(/\/\/.*$/, "").replace(/\/\*[\s\S]*?\*\//g, "");
      const m = code.match(/(["'`])(?:(?!\1)[^\\]|\\.)*\1/g) || [];
      m.filter(s => /[가-힣]/.test(s))
       .forEach(s => offenders.push(f.replace("../", "") + ":" + (i + 1) + "  " + s));
      let km;
      while ((km = KEY_RE.exec(code))) {
        if (!(km[1] in S.t)) badKeys.push(f.replace("../", "") + ":" + (i + 1) + "  " + km[1]);
      }
    });
  }
  assert.deepEqual(offenders, [], "한글 UI 문자열 " + offenders.length + "건:\n" + offenders.join("\n"));
  assert.deepEqual(badKeys, [], "존재하지 않는 MSStr 키 참조 " + badKeys.length + "건:\n" + badKeys.join("\n"));
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
