# 머니스쿱 모바일 Phase 3 — 고정 레전드 (값을 차트 밖으로)

- 날짜: 2026-08-10
- 대상: `map/mobile/www/chart-legend.js`(신규) · `screens/report.js` · `draw-layers.js` · `chart-draw.js` · `style.css`
- 선행: [`2026-08-10-moneyscoop-mobile-phase2-design.md`](2026-08-10-moneyscoop-mobile-phase2-design.md)
- 상태: 설계 승인됨 (2026-08-10)

## 1. 배경 — 실기기에서 뒤집힌 것

Phase 2를 폴드7에서 확인한 사용자 판단: **꿈틀은 되는데 끝점 배지가 지표 배지와 겹치고, 가려진 값이 많고, 예측 구간이 너무 좁다.** 펼친 화면에서도 답답하며 "고정된(죽어있는) 데이터 차트" 같다.

세 증상 중 둘은 이 Phase가 다루고, 하나(줌)는 Phase 4로 분리한다.

### 1.1 "가려진 값"은 가려진 게 아니다 — 버려진 것이다

`draw-layers.js`의 `_evLabel`은 빈 슬롯을 18칸까지 탐색하다 실패하면 `if (!ok) return;` 로 **라벨을 조용히 버린다.** 즉 값이 무언가에 덮인 게 아니라 애초에 그려지지 않는다. 겹침 회피를 아무리 정교하게 해도, 좁은 패널에 후보가 많으면 결과는 "일부가 사라짐"이다.

Phase 2의 공유 레지스트리 자체는 정상 동작한다 — 실측 시뮬레이션(373px, 실 한글 폰트 폭 근사)에서 등록 박스 8개 간 **겹침 0건**이었다. 문제는 회피 로직이 아니라 **한 구석에 값을 다 넣으려 한 배치**다.

### 1.2 예측 구간은 화면 크기와 무관하게 16%다

`chart-layout.js`는 `slots = tailBars + fut`로 가로를 나눈다. `TAIL_BARS=120`·`futW=24`이므로 미래 비중은 **어느 화면에서나 17%**로 고정이다. 실측:

| 화면폭 | plot 폭 | 봉 하나 | 예측 구간 |
|---|---:|---:|---:|
| 373px (커버) | 309px | 2.15px | **50px (16%)** |
| 673px | 609px | 4.23px | 99px (16%) |
| 884px (펼침) | 820px | 5.69px | 134px (16%) |

`1차·NN%` 배지 자체가 약 50px다 — **커버 화면에서 배지가 예측 구간 전체와 같은 폭이다.** 그래서 배지는 캔들 위로 물러나 그려지고, 지표 배지가 사는 바로 그 구석에서 경쟁한다. 겹침은 회피 실패가 아니라 배치의 필연이었다.

### 1.3 줌은 이 Phase가 아니다

`forge-app.js`에는 이미 `_chartWin{start,count}` + 휠 줌(:1095) + **두 손가락 핀치 줌**(:1112-1136) + 시간축 팬(:1161-1209)이 있다. 모바일엔 창 상태가 아예 없고 `tailBars`가 상수다. "죽어있는 차트" 느낌의 정체가 이것이며, `index.html`에 `user-scalable=no`가 없어 핀치가 브라우저 페이지 줌으로 빠지는 것이 "이미지 확대 느낌"의 정체다.

**이건 Phase 4로 분리한다.** 제스처 결정은 이미 내렸다(§7).

### 1.4 언어 — 시안을 안 보고 설계한 오류 (2026-08-10 정정)

초안은 레전드를 한국어로 설계했다. **틀렸다.** 핸드오프 번들(`design_handoff_moneyscoop_mobile/`)이 명시한다:

> "a separate product, **English-first**"
> "**High fidelity.** Final colours, typography, spacing, **copy** and tone are decided. Recreate the UI faithfully."

Phase 0 설계서도 같은 말을 한다 — §7 "영어권 우선, 한국은 나중", §8 v1은 다국어 체계 없이 "**영어 하드코딩, 문자열만 한 파일에 모음**".

더 결정적으로, 지표명은 **인터페이스 언어와 무관하게 영어**다. 설정에 `Keep indicator names in English`가 **기본 ON**으로 있고(`prefs.keepIndicatorNamesEnglish`), 비영어 로케일이면 "chart terminology is standard in English" 안내 시트가 뜬다. 목업이 그 이유를 직접 적어 두었다 — *"MACD를 '이동평균수렴확산지수'로 바꾸면 오히려 못 읽습니다."*

레전드는 정확히 지표명·지표값 영역이다. **새로 만드는 문자열이므로 처음부터 시안 카피로 태어난다.**

현재 앱은 섞여 있다 — `BASIC`·`5 indicators`는 영어인데 `뒤로`·`다시 시도`·`정배열 ▲`는 한국어다. 레전드만 영어로 만들면 섞임이 더 심해지므로, 이 Phase가 리포트·워치리스트 화면까지 함께 정리한다.

## 2. 범위

**넣는다**

- 차트 위 고정 레전드 행 — 지표 값 전부를 항상 표시. 크로스헤어를 끌면 그 봉의 값으로 갱신.
- 차트에서 구석 배지 제거(5종) + 끝점 차수 배지·예측가 제거.
- `TAIL_BARS` 120 → 60.
- **`www/strings.js` 신규** — Phase 0 §8의 "문자열만 한 파일에 모음". UI 문자열 단일 출처.
- **리포트·워치리스트 화면 카피를 시안 영문으로.** 차트 안에 남는 라벨(크로스·다이버전스)도 포함.

**넣지 않는다**

- 차트 창(줌·팬) — Phase 4.
- 종목명·현재가를 레전드에 재표시 — 리포트 헤더에 이미 있다.
- 레전드 항목 접기·선택 — 값이 7개뿐이라 아직 필요 없다.
- 로케일 전환·언어 시트·`keepIndicatorNamesEnglish` 설정 UI — v1 밖(Phase 0 §8). 지금은 영어 하드코딩만.
- 온보딩·지갑·증거 화면군 — 아직 존재하지 않는다.

### 2.1 발견 — 시안과 구조가 다른 곳 (범위 밖, 기록만)

목업의 Basic 리포트에서 `Not checked at this level`은 **능력 4줄**이다:

```
Historical hit rate of this setup
Indicators that disagree
Weekly and monthly agreement
Why each reading came out that way
```

현재 구현은 여기에 **지표 칩 27개**를 깔고 있다. 카피가 아니라 구조 차이라 이 Phase에서 건드리지 않는다. 별도 판단이 필요하다 — 백로그에 올린다.

## 3. 분리 기준 — 위치가 의미를 갖는 것만 차트에 남긴다

| 차트 밖 (레전드) | 차트 안 (유지) |
|---|---|
| BB 상태 · %B | MA 3선 · BB 밴드와 채움 |
| MA 정/역배열 · 지지/저항 | 골든/데드 크로스 **마커**와 라벨 |
| RSI 값 · 구간 | 다이버전스 **선**과 라벨 |
| MACD 히스토그램 · 교차 | 끝점 **진앙 마커** |
| 거래량 상태 · 가격관계 | 예측선 · 콘 · 마일스톤 점 |
| 1차 방향확률 · 끝점 예측가 | |

구석 배지는 어느 봉 위에 놓여도 뜻이 같다 — 그래서 나간다. 크로스 마커·다이버전스 선·진앙은 **특정 봉을 가리키는 것이 정보**라 남는다.

### 3.1 Phase 2 레지스트리는 어떻게 되나

정직하게: **주 소비자가 차트 밖으로 나간다.** 남는 회피 대상은 크로스 라벨·다이버전스 라벨뿐이고, 이 둘은 서로 겹칠 일이 드물다. 레지스트리를 제거하지는 않는다 — 여전히 옳고, Phase 4에서 줌인하면 여러 마커가 한 화면에 몰려 다시 필요해진다. 다만 이 Phase 이후 그 코드의 부하는 크게 줄어든다.

## 4. 배치

```
mobile/www/
  strings.js        신규 — UI 문자열 단일 출처(영어 하드코딩)
  chart-legend.js   신규 — 순수 함수. an → 레전드 행 데이터
  screens/report.js 수정 — 레전드 DOM 렌더·갱신, 배지 호출 중단, TAIL_BARS, 카피
  screens/watchlist.js 수정 — 카피
  draw-layers.js    수정 — BB·MA 배지에 M.badges 게이트 2곳 + 잔존 라벨 영문
  chart-draw.js     수정 — endDeco 에 label:null·showPx:false
  style.css         수정 — .rp-legend
  index.html        수정 — strings.js · chart-legend.js 스크립트 태그
```

`strings.js`는 `MSStr` 전역 하나에 평평한 키-값만 담는다. 보간·복수형·로케일 전환은 넣지 않는다 — v1은 영어 하나뿐이라 그 기계장치가 값을 못 한다(Phase 0 §8). 나중에 언어가 붙을 때 이 파일이 추출 지점이 된다.

**레전드는 캔버스가 아니라 DOM이다.** 이유 셋: 폰에서 DOM 텍스트가 캔버스 텍스트보다 선명하고, `measureText`·충돌 회피 계산이 통째로 불필요해지며, 값만 바뀔 때 캔버스 리페인트가 필요 없다.

`chart-legend.js`는 UMD로 `MSPreds`를 받는다(끝점 방향확률 `pcal` 때문). 따라서 `index.html`에서 **`draw-preds.js` 뒤**에 실려야 한다 — Phase 2에서 확인한 팩토리 시점 캡처 규칙과 같다.

`chart-legend.js`를 **순수 함수 모듈**로 두는 이유는 검증이다. DOM을 반환하면 노드에서 값으로 확인할 수 없다. 행 데이터를 반환하면 레전드 로직 전체가 이 저장소의 기존 방식(값 단언)으로 검증된다. DOM 조립은 `report.js`가 맡는다 — 그쪽은 원래 테스트가 없다.

## 5. 인터페이스

```js
MSLegend = {
  rows(an, pred, fi) -> [{ key, label, value, tone }]
}
```

- `an` — `paintChart`가 이미 들고 있는 `{ ma, rsi, bb, macd, va }`. 엔진 재호출 없음.
- `pred` — `an.out.prediction`. 1차 방향확률·끝점 예측가 산출에 쓴다(`MSPreds.pcal`).
- `fi` — 절대 봉 인덱스. `null`이면 최신 봉, 크로스헤어 중이면 그 봉.
- `tone` — `"bull" | "bear" | "muted"`. 색은 `report.js`가 토큰으로 매핑한다.
- `key` — `"ma" | "macd" | "rsi" | "bb" | "vol" | "pred" | "predpx"`. DOM 갱신 시 행 매칭용.

행 순서와 라벨은 **목업의 `What was read` 순서와 표기를 그대로** 쓴다:

| key | label (시안 그대로) | value 예 |
|---|---|---|
| `ma` | `Moving average` | `up · aligned` |
| `macd` | `MACD` | `+1.2 · golden 3` |
| `rsi` | `RSI` | `62 · neutral` |
| `bb` | `Bollinger` | `upper · %B 0.87` |
| `vol` | `Volume` | `spike · confirming` |
| `pred` | `1st forecast` | `62%` |
| `predpx` | `Target` | `170.70` |

지표명 5종은 시안에 문자 그대로 있는 값이라 **바꾸지 않는다**. `value` 문구는 시안에 개별 표기가 없으므로(목업은 `up`·`neutral`만 보여준다) 같은 톤의 소문자 단문으로 맞춘다.

봉별 값은 전부 존재한다(실측): BB `pctB[]`, RSI `series[]`, MACD `hist[]`, 거래량 `series[]`/`obv[]`, MA `mas.{short,mid,long}.series`.

**상태 문구와 봉별 값의 구분.** `정배열`·`스퀴즈`·`상승 확인` 같은 판정은 시계열 전체에 대한 것이라 `fi`와 무관하게 고정한다. `fi`를 따라 바뀌는 것은 숫자(RSI 값, %B, MACD 히스토그램, 거래량)뿐이다. 이 구분을 지키지 않으면 과거 봉 위에서 "지금 정배열"이 거짓이 된다.

`pred` 행의 `tone`은 `pcal < 50`일 때 `"muted"` — 차트가 회색으로 강등하는 규칙과 같은 값을 쓴다.

## 6. TAIL_BARS 60

미래 비중 16% → 29%. 커버 화면 예측 구간 50px → **88px**, 펼침 134px → **234px**.

덤으로 가격 범위가 60봉 기준으로 좁아져 세로 해상도가 올라간다. 일봉 60개 ≈ 3개월로 폰에서 한눈에 보기 적당하다. 지표는 전체 시계열로 계산되고 `fiMin`부터 그려질 뿐이라 MA60·BB20 모두 영향 없다.

Phase 4에서 창이 들어오면 이 값은 **초기 창 크기**가 된다.

## 7. 결정해 둔 것 — Phase 4 제스처

리포트는 세로로 긴 스크롤 페이지이고 차트는 그 안에 박혀 있다. 사용자 선택: **두 손가락 전용.**

- 한 손가락 — 지금 그대로. 페이지 스크롤 + 350ms 홀드 크로스헤어. **Phase 1의 홀드 계약을 건드리지 않는다.**
- 두 손가락 — 벌리기/오므리기 = 줌, 같이 밀기 = 시간축 팬.

한 손 조작이 불편하다는 단점을 알고 고른 선택이다. 기존 계약 무손상이 우선.

## 8. 테스트

| 대상 | 무엇을 고정하나 |
|---|---|
| `rows` 항목 | 7행이 순서대로 나옴 · `key` 중복 없음 |
| `fi` 반응 | 다른 `fi`면 숫자가 바뀜 · **상태 문구는 안 바뀜**(§5) |
| `fi=null` | 최신 봉 값과 일치 |
| `tone` | 강세/약세/중립 매핑 · `pcal < 50` → `"muted"` |
| 결측 내성 | `pred` 없음 · 배열 짧음 · `divergence.type` null 에서 안 던짐 |
| 배지 제거 | 페인트 단언 — `fillText`에 `RSI`·`MACD`·`Volume`·`1st` 가 더는 안 나옴 |
| 마커 잔존 | 크로스 마커·다이버전스 선·진앙은 여전히 그려짐 |
| `TAIL_BARS` | 레이아웃의 미래 비중이 25% 이상 |
| 카피 | `report.js`·`watchlist.js`·`draw-layers.js` 소스에 UI 한글 문자열이 남아 있지 않음(주석 제외) |
| `strings.js` | 모든 키가 실제로 쓰임(미사용 키 없음) · 참조된 키가 전부 존재(오타 시 `undefined` 렌더 방지) |

**변이 검증 필수.** Phase 2에서 깨진 구현에 통과하는 테스트가 5건 나왔다. 각 테스트는 그것이 지킨다고 주장하는 것을 실제로 깨뜨려 확인한 뒤에만 통과로 친다.

전체 관문은 `map/tests/run.sh`.

## 9. 열린 항목

- **Phase 4 — 차트 창**: `_chartWin` 포팅 · 두 손가락 핀치/팬 · `user-scalable=no`
- **`_predDir` PC 전역 의존** — `M.focused`를 켜기 전에 해결. 여전히 도달 불가
- **Capacitor 툴체인 검증** — 미검증. Phase 1·2·3 확인은 모두 폰 Chrome이지 WebView가 아니다
- Phase 2 이월: 마일스톤 점 x-매핑 편차 · `_fitBoxY` 즉시반환 미클램프 · `frame()` 순서 테스트 부재
