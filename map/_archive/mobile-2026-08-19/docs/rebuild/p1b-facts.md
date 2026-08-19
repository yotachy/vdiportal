# P1b 사실 조사 — 유료 경로(진행 중계·해제 전환·심화 리포트·판독문 32)

- 날짜: 2026-08-19
- 목적: `docs/superpowers/specs/2026-08-18-moneyscoop-p1-design.md` §3.5~3.8, §4 조건4의 계획서 작성용 사실 조사. **코드 수정 없음**(D의 실증 변이는 원복 완료, `git status` clean 확인).
- 조사 방식: 코드 읽기 + git log + 브라우저 관문 실측(D). 서브에이전트 미사용.

---

## A. 네 블록(sentence·forecast·hitrate·compare)의 재료

`PENDING` 표(`www/screens/report.js:54-68`)에 이 넷만 `true`로 등록돼 있고, `tierBuyable()`(`report.js:79`)이 `pendingOf(tier).length===0`을 요구해 `full`·`custom` 구매를 막는다. `sentence`·`forecast`·`horizons`(기간별)·`dissent`(반대)·`readings`(판독문)는 `report-blocks.js`의 `FULL` 선언(`report-blocks.js:18`)엔 있는데, **`dissent`·`horizons`·`readings`는 이미 구현되어 있고 PENDING에 없다** — `report.js:1476-1484` BUILD 표에서 `against:buildAgainst`(`report.js:1028`)가 `dissent`에도 연결되고(`report.js:1480`), `horizons:buildHorizons`(`report.js:827`)가 이미 직전 기본 대조를 내부에서 그리며(`prevBasic()`, `report.js:634`), `readings:buildReadingsLink`(`report.js:1345`)가 이미 `MSReadingsList.render`로 연결된다. **실제로 P1b가 새로 지어야 할 것은 sentence·forecast·hitrate 셋뿐**이고, compare는 "독립 카드로 뽑을지"만 P1b의 화면구조 결정 사항이다(내용은 이미 있음).

### A1. sentence(「한 문장으로」)
`report-model.js:sentence()`(163-170행)가 이미 순수함수로 구현돼 있다: `an.dir`(방향)로 기본 문장을 고르고, `if (an.overheat) parts.push(...)`, `if (an.resistance) parts.push(...)`로 조합한다.
**하지만 `an.overheat`·`an.resistance` 필드는 코드베이스 전체에서 이 두 줄(168-169행)에서만 참조된다** — `grep`으로 확인: 이 두 필드를 어디서도 계산·대입하지 않는다. `an`은 `report.js:analyzeFull()`(192-217행)이 만드는데 그 반환 객체(`{out, graph, vol, ma, rsi, bb, macd, va, maP, rsiP, bbP, mcP}`, 216-217행)에 `overheat`·`resistance` 키가 없다. 즉 지금 `sentence()`를 호출해도 방향 문장만 나오고 과열·저항선 절은 영원히 안 붙는다 — **템플릿 조합기는 있지만 입력 두 값(overheat·resistance 판정)이 계산되지 않은 상태**다. RSI존(`rsi.zone`, `readings.js:130` RSI_ZONE 매핑에서 쓰는 것과 같은 소스)·볼린저 상태(`bb.state`)·CCI/Williams 과열대 등에서 파생해야 할 것으로 보이고, 저항선은 MA의 `sr`(`ma.sr`, support/resistance)나 pivot/fib 레벨에서 파생해야 할 것으로 보인다(둘 다 32지표 전체 그래프에서만 나오므로 유료 티어에서만 계산 가능 — basic 5지표엔 pivot/fib이 없다).

### A2. forecast(「내일 예상 + 확신」)
확신 %의 출처는 `report-model.js:confidence()`(48-53행) 및 `horizonRows()`(55-77행)의 `prob` 필드 — `FC.calibrateUpProb(FC.upProb(...))`로 캘리브레이션된 값(70행)이지 원값(raw)이 아니다(하락 판정에서 최대 28%p 어긋남, 66-68행 주석). `horizonRows()`는 이미 구현·호출 중(`report.js:buildHorizons()`가 씀)이라 forecast 블록은 이 기존 계산을 그대로 재사용할 수 있다(새 계산 불필요, `rows[0]`이 "내일").
basic에서 걷어낸 문구는 git 이력에서 확인됨: 커밋 `10e86b1` "기본분석 리포트 — 판정 카드에서 확신%을 걷어내고 지표 빗을 세운다 (P1a Task 3)" — 커밋 메시지: "기본 티어 verdict 카드가 확신%·적중률·베이스라인까지 한 카드에 욱여넣고 있었다(도구가 5개뿐이라 오독)... 걷어낸 확신·적중률·베이스라인 문구(구 `rpHitLead*`·`rpHitScope*`·`rpHitBase*`)"(strings.js diff 참고, `report.js:732-736` 주석에도 같은 취지 기록). 이 세 문구군이 forecast·hitrate가 되살릴 재료다.

### A3. hitrate(적중률 단독 블록)
`window.MSBacktest`(생성물, `www/vendor/backtest-summary.js` 35줄 전체) 필드 전부:
```
engineVersion "1.11.0"
graphIndicators 19        # ← 5도 32도 아닌 별도 표본(샘플 그래프)
indicatorCount 32
directionHitRate 0.5821 (58.2%)
bullHitRate 0.6170 (61.7%)
bearHitRate 0.4248 (42.5%)
baselineAlwaysUp 0.6096 (60.96%)   # ← §3.3의 "자명 기준선"
calibrationECE 0.00192
coneCoverage 0.7784
avgWin 0.1867 / avgLoss -0.1065
nForecasts 31971
nSeries 87
generatedAt "2026-08"
tiers.basic  {indicators:5,  directionHitRate:0.5818(58.2%), coneCoverage:0.7382(73.8%), calibrationECE:0.01054(1.05%p), nForecasts:31971}
tiers.deep   {indicators:32, directionHitRate:0.5854(58.5%), coneCoverage:0.7714(77.1%), calibrationECE:0.00269(0.27%p), nForecasts:31971}
```
`tiers.custom`/`expert` 필드는 없음 — §3.7 "측정 중"의 근거가 데이터 자체의 부재로 확인됨.
`report-model.js:hitRate(summary, regime)`(85-105행)는 `summary.bullHitRate`/`bearHitRate`(top-level, **19지표 sampleGraph 기준** — 91-95행 주석 "이 수치는 백테스트 하네스의 그래프(19지표 sampleGraph)로 잰 것이지 Basic(5)도 Full(32)도 아니다")를 읽는다 — **tiers.basic/tiers.deep과는 다른 제3의 표본**이다. `n=31971, series=87` 둘 다 20 이상이라 `n<20` 규칙에 걸리는 필드는 없다.
**`MSReportModel.hitRate`는 현재 `report.js` 어디서도 호출되지 않는다**(grep 결과 0건) — 순수 계산은 있는데 배선이 아예 안 된 상태. `buildCompare()`(3단 대조, basic 화면)는 이 함수를 안 쓰고 `MSTierCompare.rows()/baseline()/scope()`(`tier-compare.js`)로 별도 경로에서 `tiers.basic`/`tiers.deep`을 직접 읽는다 — hitrate 블록을 지을 때 두 경로(hitRate() vs tier-compare.js) 중 어느 표본을 쓸지 정합을 맞춰야 한다.

### A4. compare(직전 기본분석 대비)
`buildHorizons()`(`report.js:827-909`) 안의 `prevBasic()`(634-640행)이 이미 이 기능이다: G1(값 없으면 행 자체 생략)·G2(같은 종목·같은 asOf만) 두 규칙을 이미 구현. `report.js:856-865`가 `.rp-hz-prev` 마크업으로 이미 그린다. **PENDING의 compare는 "이 내용을 horizons 카드 안에 계속 둘지, 독립 카드로 뽑을지"의 화면구조 결정일 뿐** — `compare:buildHorizons`로 잇지 않는 이유가 그러면 중복 렌더가 되기 때문(`report.js:64-67` 주석). 단, **폭 대소 전제가 최근(2026-08-18) 리뷰로 뒤집혔다**: `report.js:855-861` 상세 주석 — 독립 실측(28창) 결과 "심화가 더 좁은 사례 0.0%, 폭 비율(심화÷기본) 중앙값 1.78배, 최대 7.09배" — 유료 사용자가 돈을 낸 직후 오히려 넓어진 범위를 보게 됨. compare 블록을 새로 만들 때 "좁아진다"는 문구를 절대 쓰면 안 되고, 넓어지는 것이 정상이면 그 사실을 먼저 말해야 한다(설계서 §3.5도 동일 경고).

**의견(한 줄)**: sentence·forecast·hitrate는 순서대로 "계산 전무 → 계산 있음(재사용) → 계산 있음(미배선)"이라 난이도가 다르다 — forecast·hitrate는 배선(wiring) 작업, sentence만 진짜 새 계산(overheat·resistance 판정)이 필요하다.

---

## B. 판독문 32(§3.8) — 3줄 분리의 실제 난이도

`www/readings.js` 코퍼스는 486줄, `SAY` 맵에 32개 지표 함수(111-448행) + 방향 없는 2개(`NO_DIR.trend`/`phasefold`, 450-463행). 각 함수는 **한 문장에 해석+실측을 쉼표로 이어붙인 문자열**을 리턴한다(파일 헤더 1-15행이 이미 이 사실과 이유를 명시).

대표 예시 3개(원문 그대로, `readings.js`):
1. `rsi`(130-136행): `n0(r.last) + ", " + (RSI_ZONE[r.zone]||r.zone) + ", 50선 " + (above?"위":"아래")` → 예: `"72, 과매수, 50선 위"`
2. `bollinger`(138-147행): `cap(BB_STATE[r.state]||"중단") + (squeeze?" · 스퀴즈":"") + ", %B " + ... + ", 중심선 " + (...)` → 예: `"상단, %B 0.92, 중심선 상승"`
3. `atr`(273-278행): `"봉당 가격 대비 " + n1(r.pct) + "%, 변동성 " + (ATR_REGIME[r.regime]||"보통") + " — 콘의 폭을 정할 뿐 방향은 아님"`

`readings-list.js` 헤더(1-11행)가 이 갭을 이미 자체 문서화하고 있다: "시안 20a는 3줄인데 이 구현은 2줄이다... 3줄로 만들려면 32종 문장을 전부 평이체로 다시 쓰고 숫자를 떼어내야 하는데... 재작성 비용이 크고 잃을 것이 많다... **사용자 확인 대기 항목**." — 이미 "확인 대기"로 못박힌 이슈다.

**코퍼스 주석에 박힌 지표별 엔진 함정 목록**(⚠ 표시 9곳 + 비⚠ 명시 함정 다수, `readings.js` 실측):
1. `adx`(160-163행): rma()가 앞 period 봉을 0으로 남겨, 0>=0이 참이라 미계산 구간을 "우위"로 잘못 셈 — 선행 카운트를 firstDI/firstAdx로 가드
2. `volume`·`vwap`·`volumeprofile`·`mfi`·`cmf` 5종 공유(146행): 거래량 없으면 엔진이 synthVolume/모든봉1로 조용히 대체 — `hasVol(ctx)` 없으면 NO_VOL 거절문
3. `elliott`(357-359행): `rules.score`는 "규칙 충족 비율"이 아니라 (규칙통과비율)×(파동완성도)의 합성 유효도 — "규칙 N% 충족"으로 쓰면 거짓
4. `cycle` 두 겹(374-380행): ① phaseLabel이 한국어라 dir로 재조립 필요 ② `!r.period`만으로 실패 판정 불가 — scanPeriod가 실패해도 opts.pmin을 period로 되돌려줘 가짜 주기로 위상까지 계산됨(strength===0만이 유일한 실패 신호)
5. `roc`(389-392행): `_rocRaw`가 P≤period 구간을 0으로 채운 배열 반환 — `has(series)`로 못 잡음, 노드가 들고 있는 실제 period로 문턱 재야 함(opts 없이 불린다는 옛 주석이 거짓이었음)
6. `ao`(407-410행, ⚠ 없지만 동일 함정): conf가 P≤24까지 0인데 그 구간 last는 실제 계산값이라 conf로 가드하면 안 됨, fast로 문턱 재야 함
7. `cmf`(415-416행): `_cmfRaw`가 캔들 없어도 P길이 전부 0 배열 반환, `has(series)`로 못 잡음 + 거래량 대체 문제 중첩
8. `pattern`(425-427행): label이 한국어라 영어키(pattern.pattern)로 매핑 + P<30이면 엔진이 탐지 자체를 안 함(그 경우를 "패턴 없음"으로 적으면 거짓)
9. `trend`(NO_DIR, 446-448행): 방향·봉수·기준선을 반드시 **한 창(window)**에서 읽어야 함 — 예전엔 서로 다른 창(r.channel vs r.windows[dominant])에서 가져와 **220봉 300계열 중 78계열(26%)에서 기울기 부호가 실제로 어긋났다**(실측 회귀 기록)
10. `structure`(289-296행): 빈 결과의 두 원인(P<12 하드플로어 vs 스윙 문턱 미달)을 구분 안 하면 "봉이 모자라다"는 거짓 이유가 나옴
11. `aroon`(336-341행): up=down=0이 실패가 아니라 정상 데이터에서도 나옴(창의 첫 봉이 고점=저점일 때) — 값으로 실패 판정하면 안 됨
12. `smc`(363-372행): FVG/OB가 각각 .slice(-5)/.slice(-4)로 상한 캡, 포화 시 "N개"가 아니라 "N개 이상"으로 표기 필요
13. `fib`(192-206행): ratio===0은 되돌림이 아니라 스윙 극점 자체 — "0 레벨"이라 쓰면 뜻이 안 통함
14. `ichimoku`(211-222행): 짧은 이력에서 엔진이 기간을 압축(scaled) — 표기 안 하면 다른 계산을 같은 문장으로 오인

→ **최소 14건**(⚠ 마커 9곳 중 다수가 5개 지표를 한 번에 커버하므로 지표 단위로 세면 더 많음: volume군 5개+trend 1개+나머지 개별 8개 = 최소 17개 지표가 이 함정들 중 하나 이상에 걸림, 32개 중 약 절반). **이 근거를 잃지 않고 3줄로 가르는 것이 재작성의 핵심 리스크**다 — 함정 회피 로직(가드 조건)은 "실측 수치" 줄에 남아야 하는데 지금은 판정(NONE/NO_VOL/NO_SWINGS 여부)과 문장 조합이 한 함수 안에서 엉켜 있다.

3줄 분리 시 "실측 수치가 이미 문장 안에 있는가": **대부분 예(대략 24~28/32, ~75~85%)** — `n0/n1/sgn1/px` 등으로 이미 숫자를 뽑아 쓰고 있어(예: rsi의 `n0(r.last)`, macd의 `sgn1(r.last.hist)`) 숫자 자체는 함수 안에 있다. 다만 **지금은 숫자와 해석이 한 문자열로 concat되어 있어 분리하려면 문자열 조립 순서를 바꿔 숫자만 별도 필드로 반환하도록 SAY 함수들의 반환 타입을 바꿔야 한다**(현재 반환값은 string 하나, 3줄이려면 `{name, contrib, plain, measured}` 같은 구조로 32개 함수 전부 리팩터링 필요). 방향 없는 예외(`elliott`의 파동유효도, `smc`의 카운트캡)는 "숫자가 곧 해석"이라 분리가 애매한 소수 사례.

**trend·phasefold 처리**(현재, `readings.js:450-463`): `NO_DIR` 맵에 분리 등록, `bias`를 안 주므로 화면(`readings-list.js:34` `contribText()`)이 `row.bias==null`이면 대시(`—`)로 표기 — "0.00"으로 쓰면 중립으로 오독되니 명시적으로 구분. `trend`는 문장 자체는 생성(채널·봉수·위치), `phasefold`는 "엔진이 노드를 합성할 때만 쓰인다 — 단독 판독 없음"이라는 고정 문구만 반환(계산 없음, `analyzeX` 자체가 없어서 — combine 안에서만 쓰이는 지표라는 게 이유).

**의견(한 줄)**: 3줄 분리는 "숫자 추출"보다 "32개 SAY 함수의 반환 타입을 string→object로 바꾸는 리팩터링"이 진짜 비용이고, 그 과정에서 위 14건의 가드 로직이 어느 줄(해석/실측)에 속하는지 하나씩 재배치해야 하는 작업이라 규모가 crop 아님.

---

## C. 진행 중계(19a)·해제 전환(8b) — 이미 있는 것

두 파일 다 **완성된 프로덕션 모듈**이고, 헤더 자체가 "19a와 8b는 규칙이 반대라 파일을 나눈다"(공통 원칙)를 명시한다.

**`www/progress-analyze.js`**(177줄, `MSAnalyzeView`): 지표를 실제 `analyzeX` 호출 1회=1칸으로 진행시키는 rAF 루프(`play()`, 60행~). 프레임예산 `FRAME_BUDGET_MS=8`(26행), 타이머 없음(주석이 명시). 탭하면 `st.drain()`으로 남은 지표를 **버리지 않고 그 자리에서 마저 읽고** 즉시 종료(139-142행). 실패(rAF 콜백 내부 예외 포함)를 `onError`로 분리 회수(65-79행, 176-183행) — 실패를 완료로 위장하지 않음.
**프로덕션 호출자 2곳**: `www/screens/onboarding.js:1019`(온보딩 6단계) · `www/screens/report.js:1161`(구매 직후 진행 중계). 둘 다 실제 호출 확인됨(grep).

**`www/progress-reveal.js`**(92줄, `MSReveal`): `MIN_MS=3000` 고정(24행), `stateAt(elapsed,total,basic)` 순수함수(27-31행)로 3초 동안 basic→total 칸을 선형 채움. 탭하면 즉시 종료(69행). **프로덕션 호출자 1곳**: `www/screens/report.js:1153`(구매 직후, 19a 완료 후 순서대로).

### §3.6 표 대비 구현 만족도
| 항목 | 요구 | 구현 상태 |
|---|---|---|
| 19a 진행 근거 | analyzeX 1회=1칸, 타이머 아님 | ✅ 완전 만족 (`progress-analyze.js:60-66` frame 루프가 `st.step()` 호출) |
| 19a 빨리 끝나면 빨리 | 늘리지 않음 | ✅ 만족 (MIN_MS류 상수 없음, 주석이 "생기는 순간 거짓말" 명시) |
| 8b 3초 고정, 빨리 끝나도 끝까지 재생 | | ✅ 만족 (`stateAt` 시간 기반) |
| 둘 다 탭=즉시 완료 | | ✅ 둘 다 만족 |
| **19a: 막 읽은 지표 가장 진하고 지난 것은 흐려짐** | | ❌ **미구현** — 최근 판독 리스트(`.an-row`, 최근 3건)만 `an-fade1`(opacity .6)·`an-fade2`(opacity .32)로 흐려짐(`style-reveal.css:75-76`). **빗(comb) 막대 자체는 이 효과가 없다** — 읽힌 칸은 전부 균일하게 `.on`(gold, `style-reveal.css:65`) |
| **19a: 빗의 흰 막대 = 현재 읽는 위치** | | ❌ **미구현** — `.an-tooth`는 `on`(읽음, gold) / 비-on(대기, track색) / `an-core`(기본 5, steel) 3상태뿐(`style-reveal.css:63-66`). "지금 읽는 중"을 가리키는 별도 흰색 상태 없음 |
| 19a 중간 집계 `상승 12·하락 4·횡보 1` | | ✅ 만족 — `tallyOf()`(29-38행) + `paint()`의 `tally.textContent`(114행) 정확히 이 형태로 이미 렌더 |
| **8b 카운터 16/32** | | ✅ 만족 — `rv-count`(58행) `st.lit + "/" + total` |
| **8b 동의·반대·무판정 세 통(합=카운터)** | | ❌ **부분만 구현** — `count.textContent`(75행)에 `agree`만 붙음(`o.agree`, `verdict.confluence.agree`, `report.js:1152`). **반대·무판정 값 자체를 안 받는다.** `report-model.js:verdict()`(140-151행)가 이미 agree/dissent/noDir 셋을 검산까지 해서 돌려주는데(합=total 보장) `progress-reveal.js`는 이 함수를 안 쓰고 엔진 `confluence.agree`만 받는다 — **재료(verdict())는 있는데 8b가 그 재료를 안 쓴다** |

**의견(한 줄)**: 19a·8b 둘 다 "몸통"은 이미 완성돼 있고, §3.6이 요구하는 시각효과 3건(진하기 그라데이션·흰 막대·3통 분해) 중 2.5건이 CSS/데이터 배선 추가로 끝날 규모다 — 새 모듈이 필요한 일이 아니다.

---

## D. 사전조건 — 관문 `errs` 스냅샷 시점 (실증 완료)

**실재함, 실증으로 확인.** `tools/gate-browser.mjs:241-244`:
```js
js += '\n<script>setTimeout(function(){var ok=false,err="";' +
  'try{ok=!!(' + route.assert + ');}catch(e){err=String(e);}' +
  'document.title="GATE:"+JSON.stringify({ok:ok,err:err,errs:(window.__gateErrs||[]),warns:(window.__gateWarns||[])});},' +
  (route.delay || 1500) + ');</script>';
```
`route.delay`(기본 1500ms) 시점에 **딱 한 번** `window.__gateErrs` 배열을 `JSON.stringify`로 title에 굳힌다. `--virtual-time-budget`은 `delay+3000`(279행)이라 크로미움은 그 뒤로도 3초 더 돌지만, title은 그때 다시 안 찍는다 — `--dump-dom`(279행)이 budget 종료 시점에 DOM을 읽어도 title 문자열 자체는 `delay` 시점 값 그대로다.

**실증**(임시 라우트 2개를 `gate-routes.mjs`에 추가해 `node tools/gate-browser.mjs <name>` 실행 후 원복, `git status` clean 확인 완료):
- `TEMP-late-error-probe`: `delay:1200`, `scripts:[{at:1400, code:'console.error("LATE_ERROR_TEST_SHOULD_BE_CAUGHT")'}]` (스냅샷 200ms **뒤**에 오류 발생) → **`✓` 통과** — 오류가 안 잡힘
- `TEMP-early-error-probe`: 동일 라우트, `at:800`(스냅샷 400ms **전**) → **`✗` 실패, "콘솔 오류: EARLY_ERROR_TEST_SHOULD_BE_CAUGHT"** — 메커니즘 자체는 정상 작동

→ 스냅샷 이후 발생하는 오류는 **실제로, 결정적으로 누락된다**. P1b는 비동기 분석(`MSAnalyzeView.play`의 rAF 루프)·해제 전환(`MSReveal.play`의 3초 rAF)·차트 작도가 구매 흐름에 새로 낀다 — 이 흐름 전체가 지금 각 라우트의 고정 `delay`(예: `report` 라우트 1200ms, `report-locked-tiers` 1400ms) 안에 다 끝난다는 보장이 없다. `report.js:1148-1170`의 구매 후 시퀀스(19a 재생 → 8b 3초 재생 → draw())만도 **최소 3초 이상**이 걸리므로, 이 흐름을 여는 관문 라우트를 새로 추가할 때 `delay`를 그 재생시간보다 넉넉히 잡지 않으면 스냅샷이 재생 도중에 찍혀 이후 오류를 놓친다 — 위 실증이 보여준 바로 그 실패 모드다.

부수 발견(§E와도 연결): `PROGRESS.md:109` "P4 온엔딩 최종 리뷰가 남긴 후속" 표에 이미 **"`report.js` 구매 흐름의 `MSAnalyzeView` 관문 부재"**가 등록돼 있다 — "`progress-analyze.js`의 두 번째 호출자(report.js)인데 이를 실제로 태우는 node 시험도 관문 라우트도 없다... 위험도 상승 판정"(원문). 즉 지금 어떤 관문 라우트도 report.js의 구매→19a→8b 시퀀스를 실제로 안 태운다 — D의 스냅샷 문제와 별개로, **그 경로 자체가 지금 관문 사각지대**다.

**의견(한 줄)**: P1b가 구매 흐름을 건드리면 그 라우트의 `delay`를 "19a+8b 합산 재생시간 + 여유"로 재계산해서 새로 잡아야 하고, 위 미태워진 라우트 부재(PROGRESS.md 109행)도 이번에 같이 메우는 게 맞다 — 둘이 같은 구멍의 다른 증상이다.

---

## E. 파일 크기·구조

`www/screens/report.js` 현재 1569줄. 기존 build 함수 크기(참고 기준선):
- `buildComb`(단일 카드, 지표빗): 798-826행 = 29줄
- `buildAgainst`(dissent, 목록형): 1028-1060행 = 33줄
- `buildHorizons`(직전대조 내장, 지평 3행): 827-909행 = 83줄
- `buildCompare`(3단 대조, 티어별 카드 3장): 910-980행 = 71줄
- `buildWeights`(요약+비교+버튼): 1310-1336행 = 27줄

새 블록 규모 추정(위 기준선 대비): sentence(단일문장, buildComb류)≈15-25줄 + overheat/resistance 판정 계산(별도, report-model.js 또는 analyzeFull 확장)≈20-40줄 · forecast(horizonRows 재사용, buildHorizons 서브셋)≈40-60줄 · hitrate(hitRate() 배선, buildCompare 레이트열과 유사)≈40-60줄 · compare(이미 buildHorizons 안에 있음, 독립화 시 추출 비용≈20-30줄, 안 하면 0). PENDING/BUILD 표 수정 자체는 각 5-10줄. **합산 추정 150~250줄** → report.js는 완료 후 대략 1750~1800줄대가 될 것으로 보임(순수 추정, 실측 아님).

**이미 분리된 모듈 경계**:
- `report-model.js`(174줄) — **DOM 없는 순수 계산**(horizonRows·hitRate·tfRows·agreeCount·verdict·sentence·confidence). 새 계산(overheat/resistance 판정 등)이 들어갈 자연스러운 자리
- `report-blocks.js`(37줄) — **티어별 블록 id 선언 순서만**(BASIC/FULL/CUSTOM 배열). PENDING 해제 자체는 여기가 아니라 `report.js`의 PENDING 상수를 고치는 일
- `tier-sheet.js`(194줄) — 단계 선택 시트(6b) 전용, P1b 범위 밖(§3.4는 P1a 완료)
- `report.js`(1569줄) — **DOM 빌드(build*) + 화면 상태기계 + 구매 흐름**. 새 블록의 build 함수 4개(sentence/forecast/hitrate/compare)는 기존 build* 함수들과 같은 자리(BUILD 표, `report.js:1468-1487`)에 자연스럽게 들어감 — **새 파일 분리가 필요할 명확한 근거는 없음**(기존 8개 build 함수와 같은 패턴 반복이라 구조적 이질감 없음)

**P1a가 남긴 부채 중 P1b와 겹치는 항목**(`PROGRESS.md:39-44`, "P4 온보딩 최종 리뷰 후속" `PROGRESS.md:93-111`에서 추림):
1. `PROGRESS.md:41` — "심화·전문분석이 P1b 블록 때문에 잠겨 있다... **P1b가 8블록 심화 리포트를 완성하면 이 잠금이 자연히 풀리고, 그때 CTA 버튼과 시트 순서 단언(관문에 주석으로 남겨둠)이 함께 되살아난다**" — `report-locked-tiers` 관문 라우트(`gate-routes.mjs` 743행 근방)의 주석 처리된 옛 단언을 되살리는 작업이 P1b 완료 시점의 후속작업으로 이미 지정돼 있음
2. `PROGRESS.md:109` — 위 D절에서 인용한 "MSAnalyzeView 관문 부재"(report.js 구매 흐름을 태우는 라우트/시험이 없음) — P1b가 이 흐름을 직접 다루므로 이번에 메워야 함
3. `PROGRESS.md:110` — `.rp-last-more`의 소유 블록 `buildLast()`가 `report-blocks.js`의 어느 티어 선언에도 안 물려 **프로덕션 죽은 코드**, "배선할지 지울지는 P1b 판단"이라고 명시적으로 P1b에 위임됨
4. `PROGRESS.md:44` — "가장 많이 씀" 배지 노출조건(잠금 여부와 무관하게 보일지)이 "P1b 착수 시 재검토 후보"로 명시 지정됨

무관 항목(P1b가 안 건드림): `.ms-sheet` 드래그 손잡이(42행, P0 이월)·재진입 가드 실기기 검증(43행)·5→6 UI rAF 검증(111행, 온보딩 전용)·I2/I5/M1-M6(93-108행, 전부 온보딩 화면 전용) — 전부 report.js/readings.js 밖.

---

## F. 전문(P1c)과의 경계

`CUSTOM = ["weights"].concat(FULL)`(`report-blocks.js:22`)이 실제 구조. `pendingOf(tier)`(`report.js:70-77`)는 `forTier(tier)`가 선언한 id 중 `PENDING`에 있는 것만 걸러낸다 — **`weights`는 `PENDING`에 등록된 적이 없다**(PENDING 키는 sentence/forecast/hitrate/compare 넷뿐, `report.js:54-68`). 따라서:

**P1b가 sentence·forecast·hitrate·compare 네 id를 PENDING에서 지우면, `pendingOf("full")`과 `pendingOf("custom")`이 같은 시점에 둘 다 빈 배열이 된다** — CUSTOM의 나머지 8개 id(weights 포함)는 애초에 PENDING에 없었으므로 `tierBuyable("custom")`도 자동으로 `true`가 된다. **전문은 별도 작업 없이 자동으로 함께 열린다** — 코드로 확인됨, 별도 게이팅 로직 없음.

`buildWeights()`(`report.js:1310-1336`)는 이미 완전히 동작하는 요약 카드다: 조정된 가중치 개수(`tuned`/`tunable().length`), 심화 구매 기록이 있으면 폭 비교(심화 폭 vs 내 가중치 폭), "수정" 버튼(`runCustom()` 호출, 1336행)으로 실제 편집기를 다시 연다. **실제 가중치 슬라이더 UI는 `buildWeights()`가 아니라 별도 화면 `www/screens/expert.js`**(177줄, `MSExpert.open`, `report.js:1539-1550`에서 호출)에 있다 — `expert.js:158-159`에서 `sl.min=W_MIN(0.1), sl.max=W_MAX(3.0), sl.step="0.1"`으로 §3.7이 요구한 "0.1~3.0 연속값" 슬라이더가 **이미 구현돼 있음**을 확인. 프리셋 초기화(`MSIndTiers.PRESETS`, `expert.js:29,102`)·범위 표기(`expert.js:116`)도 이미 존재.

**의견(한 줄)**: F 관점에서 P1c는 사실상 "이미 끝나 있다" — P1b가 PENDING만 비우면 전문 구매·전문 리포트(심화 8블록+weights)·가중치 편집기까지 전부 코드상 이미 작동 가능한 상태로 보인다(단, sentence/forecast/hitrate가 CUSTOM 선언에도 포함되므로 그 셋의 실제 정확도는 custom 티어에서도 동일하게 검증해야 함 — weights가 바뀌면 an.overheat/resistance 계산도 같이 바뀌어야 하는지가 A1의 후속 질문).

---

## 계획을 쓰는 사람이 놀랄 만한 사실 3가지

1. **PENDING 4개 중 실제로 "새로 지어야" 하는 건 사실상 sentence 하나뿐이다.** forecast는 `report-model.js:horizonRows()`(이미 구현·이미 호출 중)를 재사용하는 배선 작업이고, hitrate는 `report-model.js:hitRate()`(이미 구현됐지만 **현재 report.js 어디서도 호출되지 않는 죽은 순수함수**)를 배선하는 작업이며, compare는 `buildHorizons()` 안의 `prevBasic()`(이미 완전 구현·이미 렌더 중)을 독립 카드로 뽑을지 말지의 결정일 뿐이다. 반면 sentence는 `sentence()` 템플릿 함수는 있는데 그 입력값(`an.overheat`/`an.resistance`)이 **코드베이스 어디에도 계산되는 곳이 없다** — 진짜 새 로직이 필요한 유일한 블록이다.

2. **8b(해제 전환)가 요구하는 "동의·반대·무판정 세 통"의 계산 함수(`report-model.js:verdict()`)는 이미 검산까지 마친 채로 존재하는데, `progress-reveal.js`는 그걸 안 쓰고 엔진의 `confluence.agree` 하나만 받아 쓰고 있다.** 재료가 있는데 안 쓰는 상태라 8b 수정은 계산이 아니라 배선 문제다.

3. **관문 `errs` 스냅샷 누락은 실증으로 100% 확정됐다** — 스냅샷 200ms 뒤에 던진 `console.error`는 관문을 그대로 통과(`✓`)시켰고, 400ms 전에 던진 동일 오류는 정확히 잡혔다(`✗`). 그리고 이미 `PROGRESS.md`에 "`report.js` 구매 흐름을 태우는 관문 라우트가 아예 없다"는 사실이 별도로 기록돼 있어, P1b가 손댈 바로 그 경로(구매→19a→8b→draw)가 지금 이중으로 무방비 상태다(스냅샷 시점 문제 + 태우는 라우트 자체 부재).
