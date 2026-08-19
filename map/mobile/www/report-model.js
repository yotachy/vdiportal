// 리포트 화면의 계산만 담는다 — DOM 도 전역 엔진도 만지지 않는다.
// ForgeCore 를 인자로 받는 것은 MSGraph.basicGraph(ForgeCore) 와 같은 규약이다.
// verdict()·sentence() 는 문구 조각을 strings.js 에서 받는다(P1a Task 2) — chart-legend.js 가
// MSStr 을 팩토리 인자로 받는 것과 같은 규약. 전역 MSStr 을 이 파일 안에서 직접 참조하면
// node --test 가 require("./strings.js") 로 주입한 것과 어긋난다.
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory(require("./strings.js"));
  else MSGlobals.define("MSReportModel", factory(root.MSStr));
})(typeof self !== "undefined" ? self : this, function (Str) {
  "use strict";

  var T = (Str && Str.t) || {};

  // 시안 2a 의 Tomorrow / In 1 week / In 1 month. 3개월(63봉)은 futW 상한(60)과
  // 콘 비중(28%→50%) 때문에 뺐다 — 설계서 §3.2.
  var HORIZONS = [{ key: "d1", bars: 1 }, { key: "w1", bars: 5 }, { key: "m1", bars: 21 }];

  // 변화율 데드존 — 이 아래는 방향이 없는 것으로 본다(회색). screens/report.js 의 지평 행
  // 색 판정과 반드시 같은 임계를 써야 한다 — 다르면 색은 회색인데 확률은 방향으로 뒤집히는
  // 불일치가 생긴다(스윕 241건 중 1건 실제 발생, 최종수정웨이브 §⑥).
  var FLAT_EPS = 0.05;

  function dirOf(chg) {
    return chg > FLAT_EPS ? "up" : chg < -FLAT_EPS ? "down" : "flat";
  }

  // 엔진의 타임프레임 프로필은 한글로만 분기한다(forge-core.js trendProfileForTF).
  // PC 는 tfKo() 로 변환해 넘기는데 모바일은 Phase 1 부터 "1day" 를 그대로 넘겨 계속 default
  // 프로필을 썼다 — 일봉용 bandScale·sigmaCap·texScale 을 못 받고 있었다.
  // API(loadTicker)는 계속 영문 "1day"/"1week"/"1month" 를 쓴다 — 엔진 인자만 여기서 바꾼다.
  // 이 파일에 두는 이유: screens/report.js 는 strings.test.mjs 의 KEY_SCAN_FILES 대상이라
  // UI 문자열 스캔이 한글 리터럴을 화면 문구로 오인한다 — 여기(비스캔 계산 전용 모듈)가
  // draw-preds.js 의 _tfUnit() 과 같은 선례를 따르는 자리다.
  function tfKo(tf) {
    var s = String(tf || "");
    if (/month|월/.test(s)) return "월봉";
    if (/week|주/.test(s)) return "주봉";
    return "일봉";
  }

  function anchorOf(p) {
    if (!p || !p.path || !p.path.length) return null;
    return (p.anchor != null && isFinite(p.anchor)) ? p.anchor : p.path[0];
  }

  // 부른 방향이 맞을 확률. 중립이면 가리킬 방향이 없으므로 null —
  // 없는 방향에 "그 방향이 맞을 확률"을 붙일 수 없다(설계서 §6.1).
  function confidence(FC, prediction, regime) {
    if (regime !== "bull" && regime !== "bear") return null;
    var up = FC.aggUpProb(prediction);
    if (up == null || !isFinite(up)) return null;
    return regime === "bull" ? up : 100 - up;
  }

  function horizonRows(FC, prediction, regime) {
    var a = anchorOf(prediction);
    if (a == null) return [];
    var path = prediction.path, hi = prediction.hi || [], out = [], i;
    var neutral = (regime !== "bull" && regime !== "bear");
    for (i = 0; i < HORIZONS.length; i++) {
      var h = HORIZONS[i], idx = h.bars - 1;
      if (idx >= path.length) continue;            // 경로가 짧으면 그 행은 없다
      var v = path[idx];
      var chg = a ? ((v - a) / a) * 100 : 0;
      var dir = dirOf(chg);
      var prob = null;
      if (!neutral) {
        // 헤드라인 확신(FC.aggUpProb)·차트 레전드(forge-draw.js:_predPCal) 모두 캘리브레이션을
        // 거친다. 여기만 원값(raw)을 쓰면 Platt 절편(+0.3501)만큼 스케일이 갈려, 하락 판정에서
        // 지평 행과 헤드라인이 최대 28%p 어긋난다(실측, 최종수정웨이브 §①).
        var cal = FC.calibrateUpProb(FC.upProb(v, hi[idx], a));
        prob = (dir === "down") ? 100 - cal : cal;   // '그 변화가 일어날' 확률(PC 와 같은 정의)
      }
      out.push({ key: h.key, bars: h.bars, price: v, chgPct: chg, dir: dir, prob: prob });
    }
    return out;
  }

  // 방향별 적중률. 전역 directionHitRate(58.1%) 하나를 모든 판정에 붙이면 하락 판정과 안 맞는다 —
  // 하락 콜은 구조적으로 절반 아래에서 맞는다(bearHitRate 42.6%, 백테스트 113/113건 실측 43~48%
  // 확신대). 46% 대 확신 옆에 58.1%를 붙이면 헤드라인과 적중률이 서로 다른 이야기를 한다.
  // 그래서 regime 이 가리키는 방향의 실측치를 그대로 쓴다(사용자 결정, 최종수정웨이브 §②).
  // 생성물(vendor/backtest-summary.js)이 없거나 해당 방향 필드가 없으면 null — 적중 행만 감추고
  // 화면은 성립한다. regime 이 중립이면 호출부(screens/report.js)가 이미 걸러 부르지 않지만,
  // 여기서도 방어적으로 null 을 돌린다.
  function hitRate(summary, regime) {
    if (!summary) return null;
    var key = regime === "bull" ? "bullHitRate" : regime === "bear" ? "bearHitRate" : null;
    if (!key) return null;
    var v = summary[key];
    if (typeof v !== "number" || !isFinite(v)) return null;
    var right = Math.round(v * 1000) / 10;
    // n·시리즈 수를 함께 돌려준다 — 화면이 "무엇에 대해 잰 수치인지"를 말하려면 범위가 필요하다.
    // 이 수치는 백테스트 하네스의 그래프(19지표 sampleGraph)로 잰 것이지 Basic(5)도 Full(32)도
    // 아니다. 그래서 화면은 "이 판정 같은 콜"이라고 말하면 안 되고 범위를 밝혀야 한다.
    var n = (typeof summary.nForecasts === "number" && isFinite(summary.nForecasts)) ? summary.nForecasts : null;
    var series = (typeof summary.nSeries === "number" && isFinite(summary.nSeries)) ? summary.nSeries : null;
    // 베이스라인("항상 오른다")을 같은 요약에서 함께 돌려준다 — 적중률을 단독으로 놓으면
    // 사용자는 그것을 "동전보다 낫다"로 읽는다. 이 자산·이 기간의 기준선은 50% 가 아니라
    // 61.0% 이고 방향 판정은 그 아래다(P2 설계서 §2 R2). null 이면 화면이 베이스라인 없이
    // 적중률만 그리는 게 아니라 **적중 행 자체를 감춘다**(호출부) — 비교 없는 숫자는 안 낸다.
    var b = summary.baselineAlwaysUp;
    var baseline = (typeof b === "number" && isFinite(b)) ? Math.round(b * 1000) / 10 : null;
    return { right: right, wrong: Math.round((100 - right) * 10) / 10, n: n, series: series, baseline: baseline };
  }

  // 주기 행 — runs 는 [{tf, out, error}] 배열이고 순서가 곧 표시 순서다.
  // 이력이 모자란 주기(신규 상장주의 월봉 등)는 행을 지우지 않고 사유를 담는다 —
  // 빈칸으로 두면 "돈 냈는데 안 준다"로 읽힌다(설계서 §5.5).
  function tfRows(FC, runs) {
    var list = runs || [], out = [], i;
    for (i = 0; i < list.length; i++) {
      var r = list[i];
      if (!r.out) { out.push({ tf: r.tf, regime: null, prob: null, target: null, reason: r.error || "unavailable" }); continue; }
      var v = r.out.verdict || {};
      out.push({ tf: r.tf, regime: v.regime || null,
                 prob: confidence(FC, r.out.prediction, v.regime),
                 target: (typeof v.target === "number" && isFinite(v.target)) ? v.target : null,
                 reason: null });
    }
    return out;
  }

  // 일봉 판정을 기준으로 같은 방향인 주기 수를 센다. 일봉이 없으면(다른 호출부가 주·월만 넘기는 경우)
  // 첫 성공 주기로 떨어진다 — 배열 순서에 조용히 기대지 않도록 기준을 명시한다.
  // 실패한 주기는 분모에서 빠진다 — 못 읽은 것을 "동의하지 않음"으로 세면 판정이 실제보다 약해 보인다.
  function agreeCount(runs) {
    var list = runs || [], base = null, agree = 0, total = 0, i, r;
    for (i = 0; i < list.length; i++) {
      r = list[i];
      if (r && r.out && r.out.verdict && r.tf === "1day") { base = r.out.verdict.regime; break; }
    }
    for (i = 0; i < list.length; i++) {
      r = list[i];
      if (!r || !r.out || !r.out.verdict) continue;
      total++;
      if (base === null) base = r.out.verdict.regime;
      if (r.out.verdict.regime === base) agree++;
    }
    return { agree: total ? agree : 0, total: total };
  }

  // 판정 뷰모델 — 지표 바이어스 부호 집계(up/down/flat)를 화면이 쓰는 동의/반대/무판정으로
  // 매핑하고 합계를 검산해 돌려준다. dir 이 어느 부호가 "동의"인지를 정한다 — 하락 판정에서는
  // down 이 동의, up 이 반대가 된다(설계서 §3.5). 매핑을 화면마다 따로 하면 심화·전문에서
  // 부호가 뒤집혀도 아무도 못 잡는다. total 을 여기서 도출해 돌려주는 이유는 "도구 32개 중
  // 24개" 같은 헤드라인 카운터와 agree+dissent+noDir 의 합이 반드시 맞아야 하기 때문이다.
  function verdict(an) {
    var dir = (an && an.dir) || null;
    var up = (an && typeof an.up === "number") ? an.up : 0;
    var down = (an && typeof an.down === "number") ? an.down : 0;
    var noDir = (an && typeof an.flat === "number") ? an.flat : 0;
    var agree = 0, dissent = 0;
    if (dir === "bull") { agree = up; dissent = down; }
    else if (dir === "bear") { agree = down; dissent = up; }
    else { noDir = up + down + noDir; }   // 방향이 없으면 "동의"할 방향 자체가 없다
    return { dir: dir, agree: agree, dissent: dissent, noDir: noDir, total: agree + dissent + noDir };
  }

  // sentence() 의 두 절 판정. 문턱은 P1b Task 2 가 backtest/earn-ohlc.json 2813창 실측으로
  // 정했다(과열 23.5%·저항 20.7%, mobile/tools/measure-sentence-signals.mjs 가 이 저장소의
  // 판단 기록). **정의는 여기 하나뿐이다** — 그 tools 파일은 이제 이 두 함수를 그대로
  // require 해서 되잰다(반대 방향 금지: 프로덕션이 tools 를 참조하면 안 된다). 조건식을
  // 바꾸면 test/sentence-signals.test.mjs 의 극단 비율·breakoutGuard 시험이 먼저 빨개진다.
  //
  // 인자는 an 전체가 아니라 조각(sig={bb,rsi} · sig={ma})이다 — analyzeFull()(screens/
  // report.js) 이 an 자체를 조립하는 도중에 이 두 함수를 부르기 때문에 아직 없는 an 을
  // 넘길 수 없다(순환 참조). bb·rsi·ma 는 analyzeFull() 이 그 직전 줄에서 이미 만들어 둔
  // 지역 변수라 이 조각만 넘기면 순환 없이 값이 흐른다.
  function overheat(sig) {
    var bb = sig && sig.bb, rsi = sig && sig.rsi;
    // 볼린저 breakout_up(%B>1, 종가가 상단밴드 위로 마감=밴드워킹)은 추세 지속 신호다 —
    // 상승 base 문장 위에 "다만 다소 과열된 구간입니다"를 붙이면 스스로 모순된다(Task 2
    // 리뷰 Important A). 그래서 upper(밴드 안에서 상단에 붙은 상태)만 과열로 본다.
    return !!((bb && bb.state === "upper") || (rsi && rsi.zone === "overbought"));
  }
  function resistance(sig) {
    var ma = sig && sig.ma;
    // ma.sr 은 엔진(forge-core.js analyzeMA)이 이미 1.5%(기본 srPct) 안에서만 채우고,
    // 차트가 지지/저항 마커를 그릴 때 읽는 것과 같은 필드다 — 새 문턱을 여기서 발명하지 않는다.
    return !!(ma && ma.sr && ma.sr.side === "resistance");
  }

  // 19b 「한 문장으로」— 생성 문구가 아니라 방향·과열·저항 세 값을 규칙으로 잇는 템플릿이다.
  // 숫자를 먼저 내면 대부분은 해석을 못 하고 닫기 때문에 이 문장이 심화 리포트 선언 순서의
  // 맨 위에 온다(P1a Task 2). 문구 자체는 strings.js 에서 오고 여기는 조합만 한다 — 문장을
  // 바꾸고 싶으면 strings.js 만 고치면 된다.
  function sentence(an) {
    var dir = an && an.dir;
    var base = dir === "bull" ? T.rpSentBull : dir === "bear" ? T.rpSentBear : T.rpSentFlat;
    var parts = [base];
    if (an && an.overheat) parts.push(T.rpSentOverheat);
    if (an && an.resistance) parts.push(T.rpSentResistance);
    return parts.join(" ");
  }

  return { HORIZONS: HORIZONS, FLAT_EPS: FLAT_EPS, confidence: confidence, horizonRows: horizonRows, hitRate: hitRate, tfRows: tfRows, agreeCount: agreeCount, tfKo: tfKo, verdict: verdict, overheat: overheat, resistance: resistance, sentence: sentence };
});
