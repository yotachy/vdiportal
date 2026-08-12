# 머니스쿱 모바일 — `REASONING · 32 NODES` (시안 6a)

> 대상: `map/mobile/` · 설계일 2026-08-12
> 선행: Phase 8a(`2026-08-12-moneyscoop-mobile-phase8a-design.md`) · 디자인 정합 패스(커밋 `aef651d..e2bb319`)
> 백로그 `mobile/docs/BACKLOG-mobile.md` 의 **🔥 다음 1번**.

## 무엇을 만드는가

Full 리포트(3스쿱)에 **지표별 영어 판독문**을 붙인다. 지금 Full 이 32종을 다 돌려놓고 화면에 내는 것은
`AGAINST THIS CALL` 의 이름·기여도뿐이다. 남은 것은 **문장** — 각 지표가 왜 그 방향을 말했는지다.

시안 6a 의 행 모양:

```
REASONING · 32 NODES
Ichimoku      Cleared the cloud 1 Aug and the lagging span confirms    +0.27
ADX / DMI     27 and rising, +DI has led for 9 sessions                +0.31
```

이름(78px) · 문장(flex, muted) · 기여도(방향색). `AGAINST THIS CALL` 은 같은 행 모양의 bear 틴트 박스다.

## 왜 지금 이것인가

- 결핍 4행 박스가 Basic 에 **"Why each reading came out that way"** 를 못 하는 것으로 적어 뒀다. 이 섹션이 그 항목이다.
- Full 의 `SIGNALS` 머리가 `32 of 32 shown` 이라고 적으면서 실제로는 `MSLegend` 7행(지표 5 + 예측 2)만 보여준다.
  같은 화면이 두 말을 하고 있고, 이 작업이 그 자리를 정리한다.

## 정하고 들어가는 것

| 결정 | 값 | 근거 |
|---|---|---|
| SIGNALS 와의 관계 | **Full 에서 REASONING 이 SIGNALS 를 대체** | 32행 안에 5종 판독이 이미 들어간다. 두 섹션이면 중복 + 스크롤 |
| 배치 | **`\|bias\|` 내림차순 32행 전부 펼침** | 3스쿱을 낸 사람이 받는 것이 "전부"임을 숨기지 않는다. 접으면 "산 것을 다시 눌러야 보인다" |
| 32 vs 30 | **32행 전부, 방향 없는 둘은 이유를 적고 기여도는 `—`** | 머리는 32 그대로, 부제에 `30 with a direction` |
| 주기 | **일봉 판독 고정** | 헤드라인 판정과 같은 주기. 세 주기를 다 깔면 96행이고, 주·월 정합은 `TIMEFRAME` 행이 이미 말한다 |
| Basic | **변경 없음** | SIGNALS 7행 + 결핍 박스 유지 |
| 새 데이터 | **없음** | `AGAINST THIS CALL` 과 같은 규율 — 백테스트 0회, 외부 호출 0회 |
| 엔진 | **무수정** | `forge-core.js` 를 건드리지 않는다 |

## 1. 모듈 경계

### 신규 `map/mobile/www/readings.js` (`MSReadings`)

`indicators.js` 는 "`analyzeX` 호출 형태 표"가 목적인 97줄 파일이다. 여기에 30종 영어 산문을 넣으면
목적이 둘인 400줄이 된다. 형제 모듈로 가른다.

```js
// readings.js
SAY = {
  adx: function (r, ctx) { ... return "27 and rising, +DI has led for 9 sessions"; },
  ichimoku: function (r, ctx) { ... },
  ...   // 30종
}
NO_DIR = {
  trend:     function (r, ctx) { ... },   // analyzeTrend 로 문장은 쓰되 기여도는 없음
  phasefold: function ()      { ... }     // analyzeX 자체가 없다 — 고정 문구
}
say(blockType, result, ctx) → string
```

- `ctx` 는 `{ price, candle, tf }` — 문장이 가격 포맷·봉 수를 쓸 때만 참조한다.
- `SAY` 의 키 집합은 `MSIndicators.SHAPES` 의 키 집합과 **정확히 같아야 한다**(테스트가 지킨다).

### `indicators.js` 에 추가

```js
readings(FC, graph, data, ctx) → [{ type, bias, text }]
```

지표마다 `callOne` 을 **한 번** 부르고, 그 결과 하나에서 `bias` 와 문장을 함께 뽑는다.

**성능 부수효과.** 지금 Full 은 같은 30종을 세 번 돈다 — `buildVerdict` 의 tally(`biases`),
`buildAgainst` 의 `opposing` + 분모(`biases`). 총 90회 `analyzeX`. `draw()` 에서 `readings()` 를 한 번
계산해 아래로 넘기면 30회가 된다. `opposing()` 은 `readings()` 결과를 걸러내는 순수 함수로 바꾼다.

## 2. 데이터 흐름

```
screens/report.js  draw()
  └ rows = MSIndicators.readings(ForgeCore, an.graph, input, ctx)   ← 30회 analyzeX, 여기 한 번뿐
      ├ buildVerdict(rows)   3구간 바 tally
      ├ buildReasoning(rows) REASONING 32행     ← 신규
      └ buildAgainst(rows)   AGAINST 박스        ← 문장 칸이 채워진다
```

`buildReasoning` 은 `rows`(30) 뒤에 `NO_DIR` 2행을 붙여 32행을 만든다. 정렬은 `|bias|` 내림차순이고
방향 없는 둘은 정렬에서 빠져 **항상 최하단**이다.

## 3. 화면

```
COMPOSITE · DAILY        판정 · 확신% · 3구간 바
HORIZON                  …
[차트]
REASONING · 32 NODES              daily · 30 with a direction
  ADX / DMI     27 and rising, +DI has led 9 sessions        +0.31
  Ichimoku      Above the cloud, tenkan crossed 4 bars ago   +0.27
  SuperTrend    Sitting 0.4% from a bearish flip             −0.18
  …
  Trend         Rising channel, 62 bars, in the upper half   —
  Phase fold    Used only where the engine blends nodes      —
AGAINST THIS CALL                            2 of 30
  SuperTrend    Sitting 0.4% from a bearish flip             −0.18
  Volume profile  Thin shelf under 158 — little support below −0.09
TIMEFRAME                …
```

- 행 마크업은 `AGAINST` 와 공유한다(`.rp-reason-row` 를 정본으로 두고 `.rp-against-row` 가 그것을 상속).
- **색은 시안 6a 그대로** — 이름 `--ink-2`, 문장 muted, 숫자만 방향색. 문장까지 물들이면 32행이
  다시 다색 덩어리가 된다(차트 위 텍스트 수프를 걷어낸 이유와 같다).
- `chartRefs.legend` 가 Full 에서 `null` 이 된다. `paintChart` 의 프레임 갱신에 이미 `if (!legend) return`
  가드가 있어 그대로 성립한다.
- **Full 에선 크로스헤어를 끌어도 숫자가 따라 움직이는 행이 없어진다**(차트 크로스헤어 자체는 남는다).
  Basic 은 종전대로 SIGNALS 가 연동된다. 의도한 트레이드오프다.

## 4. 문장 정책

**출처는 `analyzeX` 반환 필드뿐이다.** 파생 계산은 엔진이 이미 준 배열 안에서만 허용한다 —
`plusDI`/`minusDI` 배열을 훑어 "+DI 가 앞선 봉 수"를 세는 것은 허용, 새 지표를 계산하는 것은 금지.

**한국어 누출이 이 작업의 주된 함정이다.** `*Steps()` 가 한국어라 못 쓴다는 것은 이미 알고 있었지만,
**반환 필드 자체에도 한국어가 있다**. 실측으로 확인한 셋:

| 필드 | 값 | 대신 쓸 것 |
|---|---|---|
| `pattern.label` | `"헤드앤숄더"` · `"불 플래그"` | `pattern.pattern`(`"headshoulder"`·`"bullflag"`) |
| `cycle.phaseLabel` | `"고점 부근(하락 전환 임박)"` | `cycle.dir` + `cycle.phase` 로 직접 조립 |
| `fib.degrees[].name` | `"단기"`·`"중기"`·`"장기"` | 인덱스로 매핑 |

`buildCounted()` 가 `*Steps()` 로 당한 것과 같은 자리인데, 이번엔 필드 안에 숨어 있어 눈에 덜 띈다.
**구현 전에 30종 반환 필드를 전수 훑어 한국어 문자열 필드를 목록화하는 것이 첫 단계다.**

**빈 결과에도 문장이 나와야 한다.** 30종 전부 데이터 부족 시 `EMPTY` 를 돌려주는 경로가 있다
(`analyzeIchimoku` 는 `P < 20`, `analyzeADX` 는 `P < period*2+2`). 그때는 `bias 0` 에 빈 문장이 아니라
**이유를 적는다** — `Not enough bars to read`. 결핍 박스와 같은 태도이고, 신규 상장주에서 실제로 걸린다.

**날짜 대신 봉 수.** 시안의 `Cleared the cloud 1 Aug` 는 삽화다. 엔진이 주는 것은 `barsAgo` 이고,
`4 bars ago` 는 주기가 바뀌어도 참이다.

**길이.** 한 줄을 목표로, 폴드 목록 칸(255px)이 아니라 리포트 칸 기준. 두 줄까지는 허용하고 세 줄은 자른다.

### 30종이 읽을 필드 (구현 시 출처)

| 지표 | 문장이 읽는 필드 |
|---|---|
| ma | `align.order` · `cross{type,barsAgo}` · `sr{ma,side}` |
| macd | `last.hist` · `cross{type,barsAgo}` · `state` · `rising` |
| rsi | `last` · `zone` · `cross50` · `divergence.type` · `regime` |
| bollinger | `state` · `squeeze` · `last.pctB` · `midSlope` |
| volume | `state` · `relationship` · `obvTrend` · `divergence.type` · `ratio` |
| adx | `last{adx,plusDI,minusDI}` · `strength` · `dir` (+ DI 배열로 선행 봉 수) |
| stochastic | `last{k,d}` · `state` · `cross` |
| fib | `dir` · `zone` · `levels` · `degrees.length` (⚠ `degrees[].name` 한국어) |
| ichimoku | `pricePos` · `cloud` · `tkCross{type,barsAgo}` · `scaled` |
| pivot | `P`(피벗) · `R[0..2]` · `S[0..2]` · `last` — 현재가가 어느 레벨 사이인지 |
| psar | `dir` · `flip` · `last`/`sar` |
| gann | `dir` · `oneOne` · `angles` · `anchor` |
| vwap | `pct` · `last` · `upper`/`lower` |
| supertrend | `dir` · `flip` · `last` (플립까지 거리 = 가격 대비 `last`) |
| atr | `pct` · `regime` · `avg` (⚠ `bias` 는 항상 0 — 변동성은 방향이 아니다) |
| volumeprofile | `poc` · `vah` · `val` · `priceRel` |
| structure | `trend` · `event`(BOS/CHoCH) · `swingHigh`/`swingLow` |
| keltner | `pctB` · `squeeze` · `mid`/`upper`/`lower` |
| donchian | `pos` · `midSlope` · `upper`/`lower` |
| cci | `last` · `regime` |
| williams | `last` |
| aroon | `up` · `down` · `osc` |
| mfi | `last` · `regime` |
| cmf | `last` |
| elliott | `structure` · `current.label` · `next{label,target}` · `rules.score` |
| smc | `fvgs.length` · `obs.length` · `last` |
| cycle | `period` · `dir` · `strength` · `clarity` · `nextTurn` (⚠ `phaseLabel` 한국어) |
| roc | `last` |
| ao | `last` · `cross` |
| pattern | `pattern` · `confidence` · `confirmed` · `dir` (⚠ `label` 한국어) |

방향 없는 둘:

| 지표 | 문장 |
|---|---|
| trend | `analyzeTrend` 의 `channel` · `dominant` · `windows` 로 조립. 기여도 `—` |
| phasefold | `analyzeX` 가 없다 — 고정 문구 `Used only where the engine blends nodes`. 기여도 `—` |

## 5. 문자열

`strings.js` 에 섹션 문자열을 추가한다(UI 문자열 단일 출처 규약). 지표 이름은 `MSStr.ind()` 가 이미 32종을 갖고 있다.
판독문 자체는 `readings.js` 안에 둔다 — 필드 값에 따라 조립되는 것이라 `strings.js` 의 상수 테이블과 성격이 다르고,
쪼개면 한 지표의 논리가 두 파일로 갈린다(Phase 3 에서 상태 어휘가 갈렸던 것과 같은 모양).

단, `MSLegend` 와 겹치는 상태 어휘(`MA_ALIGN`·`VOL_STATE`·`VOL_REL`·`BB_STATE`·`RSI_ZONE`·`SR`)는
**반드시 `MSStr` 공유 맵을 읽는다.** 5종이 두 곳에서 다른 말을 하면 안 된다.

## 6. 검증

`map/mobile/test/readings.test.mjs` 신규. 이 저장소가 반복해서 당한 것들을 관문으로 만든다.

| 검사 | 왜 |
|---|---|
| 30종 전부 비지 않은 문장 | 표에서 한 종이 빠지면 그 행이 조용히 사라진다 |
| **전수 한글 정규식 `/[가-힣]/`** | 이 저장소가 두 번 당한 자리(`*Steps()` · 반환 필드) |
| 짧은 시계열(20봉·5봉)에서 throw 없고 문장이 나옴 | `EMPTY` 경로 전수 |
| `SAY` 키 ≡ `SHAPES` 키 | 지표를 늘릴 때 한쪽만 늘면 잡힌다 |
| `readings()` 의 bias ≡ `biases()` 의 bias | 방향 경로가 두 벌이 되는 것을 막는다 |
| `SAY` 30 + `NO_DIR` 2 ≡ `ForgeCore.indicatorCount` 32 | 머리의 "32 NODES" 가 참임을 코드가 지킨다 |
| 정렬: `\|bias\|` 내림차순 · 방향 없는 둘 최하단 | |
| `opposing()` 이 `readings()` 위에서 종전과 같은 목록을 낸다 | 리팩터 회귀 |

**기대값은 구현 상수가 아니라 밖에서 쓴다**(`test-expectations-from-outside` — 이 저장소에서 3회 재발).
문장은 fixture 로 만든 결정론적 시세에 대해 사람이 읽고 확인한 **실제 문자열을 박아둔다.**
포매터에서 유도하면 항등식이 된다.

관문은 `./tests/run.sh` 629건 → 약 645건. `forge-core` 259 · `forge-tools` 81 · `landing` 28 은 무변동이어야 한다.

## 7. 범위 밖

- **`TRACK RECORD OF THIS SETUP`**(시안 6a) — 별건. 웹이 같은 것을 제공하는지 확인이 선행.
- **`WHAT WOULD CHANGE THIS CALL`**(시안 6a) — 트리거 레벨·미모델 이벤트. 별건.
- **주·월 판독문** — 일봉 고정. `TIMEFRAME` 행이 주·월 정합을 이미 말한다.
- **Basic 의 SIGNALS 개편** — 손대지 않는다.
- **크로스헤어 연동을 REASONING 에 잇는 것** — 32행 중 5행만 값이 움직이면 일관성이 깨져 보인다.
  Full 에서 연동은 포기하는 것이 이번 결정이다.

## 8. 이 작업이 남기는 것

- 백로그 `🔥 다음` 1번이 닫힌다. 남는 것은 사용자 선행이 있는 둘(실기기 확인 · 8b 서버 원장)뿐이다.
- **실기기 미검증 항목이 하나 는다** — 32행이 실제로 읽히는 분량인지, 아니면 27칩 벽을 문장으로 바꿔
  다시 세운 것인지는 헤드리스로 볼 수 없다. 이번 패스의 핵심 가설로 백로그에 적는다.
