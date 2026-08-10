# 머니스쿱 모바일 Phase 1 — 수직 슬라이스 (워치리스트 · Basic 리포트 · 적층 차트)

- 날짜: 2026-08-10
- 대상: `map/mobile/www/` (신규 화면 + 기존 4모듈 확장) · `map/mobile/test/`
- 선행: [`2026-08-10-moneyscoop-mobile-design.md`](2026-08-10-moneyscoop-mobile-design.md)(착수 설계) · Phase 0 실측 [`map/mobile/docs/phase0-measurements.md`](../../../mobile/docs/phase0-measurements.md)
- 상태: 설계 승인됨 (2026-08-10)

## 1. 배경 — Phase 0 가 남긴 것

Phase 0 는 엔진이 폰에서 도는지와 얼마나 걸리는지만 물었다. 답은 나왔고(폴드7 3주기 콜드 776.5ms / 반복 1074.4ms), 그 과정에서 재사용 가능한 UMD 4모듈과 40개 테스트가 남았다. 버려지는 것은 계측 화면(`index.html`·`style.css`·`spike.js`)뿐이다.

Phase 1 은 그 위에 **제품의 첫 두 화면**을 올린다. 시안(`design_handoff_moneyscoop_mobile`)의 `#1a`(워치리스트)와 `#6a`/`#2a`(Basic 리포트)가 대상이다.

### 이 설계를 바꾼 실측 두 가지

**① Basic 티어는 성능 문제가 아니다.** Basic 은 MA·MACD·RSI·볼린저·거래량 5종만 읽는다.

| 봉 수 | Basic(5지표) | Full(32지표) | 비율 |
|---:|---:|---:|---:|
| 549 | 4.8ms | 78.5ms | 16배 |
| 1200 | 7.2ms | 225.7ms | 31배 |
| 2383 | 13.0ms | 639.2ms | 49배 |
| 5031 | **20.2ms** | 2581.7ms | **128배** |

봉 수가 9배 늘어도 Basic 은 4.8 → 20.2ms 로 거의 평탄하다. **Phase 0 이 본 초선형 폭발은 봉 수가 아니라 나머지 27개 지표 탓이다.** 폴드7 환산 약 7ms — 체감 즉시.

따라서 **Phase 1 은 성능 예산을 사실상 신경 쓰지 않는다.** 봉 수 ↔ 정확도 연구는 Full 티어(v3)에 붙는 과제로 옮긴다.

**② 시안의 차트는 약하다(사용자 판단).** PC 스쿱포지의 작도가 훨씬 세부적이고 좋다. 그런데 PC 의 `_draw*Layers` 계열은 `(ctx, 지표결과, 매퍼)` 만 받는 **이식 가능한 형태**다 — Phase 0 에서 "`forge-draw.js` 는 포팅하지 않는다"고 판단한 것은 파일 전체엔 맞았지만 이 계열엔 틀렸다.

## 2. 범위

**넣는다**

- 워치리스트 화면 — 캐시 즉시 표시 + 명시적 스캔 · 티커 추가/삭제 · 서버 제안
- Basic 리포트 화면 — 판정 · 정직한 범위 · 없는 것 노출 · Counted/Not counted · 주기 행(주간·월간 잠김)
- 4단 적층 차트 — 가격(캔들·MA·볼린저·예측 콘/경로) / 거래량 / RSI / MACD + 축 + 롱프레스 크로스헤어
- `localStorage` 저장
- 첫 실행 기본 3종목 시드

**넣지 않는다 (YAGNI)**

티어 선택 시트 · 지갑 · 광고 · 계정 · Full/Custom 티어 · 핀치줌/팬/전체화면 차트 · A(자동스케일)·L(로그) 토글 · 더블탭 리셋 · 온보딩 5단계 · 다국어 · 폴드 2단 레이아웃 · 종목 간 가로 스와이프.

## 3. 화면

### 3.1 워치리스트

행 구성(시안 `#1a`, turn-2 타입 시스템으로 재작도): 신호 도트 · 심볼 + 회사명 · 64×20 스파크라인 · 가격 + 등락 · 확신 배지. 행 높이 64px, 카드 보더가 아니라 헤어라인 구분선, `tabular-nums`.

- **신호 도트는 마지막 스캔 결과**다. 스캔 전이면 회색 점 + "아직 스캔 안 함".
- 상단에 **스캔** 액션. 시안 경제에서 워치리스트 스캔은 −2 Scoops 유료 액션이므로, 명시적 액션으로 짓는 것이 v3 에서 가격만 붙이면 되는 형태다.
- 각 행에 `as of` 배지(스캔 시각). 오래되면 흐리게.
- `＋ 티커 추가` — 심볼 입력 → 조회 시도 → 성공하면 추가, `notfound` 면 서버가 준 제안 최대 3건 노출.
- 스와이프 삭제 대신 **길게 눌러 삭제 확인** (스와이프는 스크롤과 충돌).

### 3.2 Basic 리포트

시안 `#6a`/`#2a` 를 따른다.

- 헤더: 뒤로 · 심볼 + 워치리스트 내 위치(`2 / 8`) · ~~Scoops pill~~(v2 이후, Phase 1 에선 자리 비움)
- 티어 칩(steel `BASIC` + 설명줄 "5 indicators") + 증거 미터 1/3
- 판정 + 확신, 그 아래 정직한 범위와 **빠진 것의 크기**
- 4단 적층 차트(§4)
- **Counted** — 5개 핵심 판독값
- **Not counted** — 27개 회색 칩(`#78819a`, 읽히는 회색. 비활성 회색 아님)
- 주기 행 — 일간은 값, **주간·월간은 자리를 차지한 채 `locked`**
- 해제 경로가 없으므로 CTA 는 **비활성 "곧 제공"**. 숨기지 않는다 — 빠진 것을 보이게 두는 것이 시안의 핵심 기제다.

**3톤 규약**: steel = Basic, gold = 엔진이 말한 것, platinum = 사용자가 설정한 것. Phase 1 에 platinum 은 등장하지 않는다.

## 4. 차트 아키텍처 (핵심)

### 4.1 패널 레이아웃

```js
chartLayout({ candle, prediction, width, height, panels, pad, tailBars }) -> {
  fiToX,                       // 공유 X 매퍼: 봉 인덱스 -> px
  nowFi, fiMin, tail, fut,
  panels: {
    price:  { rect, M },       // M = { fiToX, pToY, nowFi, fiMin, reveal }
    volume: { rect, M },
    rsi:    { rect, M },
    macd:   { rect, M }
  }
}
```

각 패널이 **자기 `pToY`** 를 갖고 **`fiToX` 를 공유**한다. 패널 높이 비율은 기본 `price 0.52 / volume 0.12 / rsi 0.18 / macd 0.18`.

`M` 이 실제로 요구하는 키는 **11개**다(스파이크로 확정):

```
fiToX  pToY  nowFi  fiMin  reveal  xRight  xNow  futBars  focused  badgeY  lastPrice
```

`badgeY` 는 상태 배지의 y, `xNow` 는 현재 시점 seam x, `futBars` 는 예측 봉 수, `focused` 는 단독 강조 여부, `lastPrice` 는 거래량 레이어가 쓰는 마지막 종가다.

### 4.2 포팅 — PC 는 두 계열이다

**스파이크로 확인한 사실**: PC 의 작도는 한 계열이 아니라 둘이며, 역할이 다르다.

| 계열 | 시그니처 | 역할 | 규모 |
|---|---|---|---:|
| `_drawXLayers` | `(c, data, M)` | **가격 패널 위 오버레이·배지** — MA 선, 볼린저 밴드, 다이버전스 선, 상태 배지 | 폐포 24심볼 **229줄** |
| `fcDrawX` | `(data, reveal)` | **서브패널 렌더러** — 자기 캔버스를 `document.getElementById` 로 직접 잡고 내부에서 자체 기하 계산 | 폐포 8심볼 **99줄** |

즉 `_drawRsiLayers` 는 RSI 서브패널을 그리지 않는다 — 가격 차트 위에 다이버전스 선과 "RSI 54 · 중립" 배지만 그린다. 실제 서브패널은 `fcDrawRsi` 다.

**포팅 대상과 상태(전부 recording-ctx 로 실제 페인트 검증 완료)**

| 대상 | 수술 | 검증된 페인트 콜 |
|---|---|---|
| `_drawMALayers` · `_drawBollingerLayers` | 없음 — 그대로 동작 | MA 508 · 볼린저 621 |
| `_drawRsiLayers` · `_drawMacdLayers` · `_drawVolumeLayers` | 없음 (가격 패널 배지·다이버전스) | 4~6콜(배지) |
| `fcDrawRsi` · `fcDrawMacd` · `fcDrawVol` | **머리 3줄 교체** — `document.getElementById`/`clientWidth` 획득을 `(c, cw, ch, data, reveal)` 인자로 | RSI 990 · MACD 1449(히스토그램 480 fill) · 거래량 554 |

합계 약 **337줄**. 심으로 채워야 하는 것: `FC_GOLD`·`FC_OSC`·`_oscRGB`(= `"232,180,99"`, 핸드오프 gold `#e8b463` 의 rgb 와 정확히 일치) · `_hzFmt`(`forge-app.js:161`, 한 줄) · `_evLabel` 이 쓰는 모듈 레벨 라벨 레지스트리(`_evLabelBoxes`·`_axisLabelBoxes`·`_predLabelBoxes`·`_evW`·`_evH`·`_labelMode`) + 매 프레임 리셋 함수 · `_hbarRsi`(meta 텍스트용 — 모바일은 Counted 섹션이 대신하므로 빈 문자열 반환).

**시연 리빌 애니메이션은 Phase 1 에 불필요** → `_skReady()` 는 `true`, `_skStroke(c)` 는 `c.stroke()` 로 심고 `reveal` 은 항상 `Infinity` 를 넘긴다.

**작도는 엔진과 달리 단일 원본이 아니다.** `forge-draw.js` 는 PC 전용으로 남고 모바일은 `draw-layers.js` 사본을 갖는다. 256KB 중 5개를 쓰자고 UMD 로 리팩터하면 PC 쪽 회귀 위험이 이득보다 크다. **작도는 표현이고 폼팩터가 다르므로 갈라져도 된다 — 숫자는 여전히 `forge-core.js` 단일 원본이다.** 이 비대칭은 의도이며 `map/CLAUDE.md` §공통 규율의 엔진 프로토콜과 모순되지 않는다(그 프로토콜의 대상은 `forge-core.js`·`forge-tools.js`다).

### 4.3 축과 크로스헤어

- 우측 가격축 + **골드 현재가 태그** · 하단 날짜축 · 예측 시작 세로 점선 · 콘 채움 9% 골드
- 축 글자 실효 **≥10.5px**, 색은 `#78819a` 이상(4.5:1 하한). Phase 0 설계에서 두 번 무너졌던 지점 — 회귀 금지
- **크로스헤어는 350ms 홀드로 진입**한다. 홀드 전 드래그는 `preventDefault` 없이 스크롤로 통과하고, 진입 후에만 `setPointerCapture` 를 잡는다 → 스크롤 충돌이 구조적으로 발생하지 않는다. `pointerup`/`pointercancel` 로 해제
- 크로스헤어는 네 패널을 관통하고, 각 패널에 그 봉의 값 라벨을 띄운다

## 5. 데이터 흐름과 스캔

```
워치리스트 진입
  → store 캐시 읽기 → 즉시 렌더
  → [스캔] → 순차 fetch(기본 간격 900ms, 429/실패 시 지수 백오프)
           → basicGraph 분석(종목당 약 7ms) → 행 하나씩 즉시 갱신
종목 탭 → 리포트 → 세션 캐시 있으면 즉시, 없으면 1건 fetch → 분석 → 렌더
```

서버가 일봉을 1시간 캐시하므로 웜 8종목 약 2초, 콜드 약 7.5초(Phase 0 실측: 웜 수신 245.8ms / 콜드 942.0ms). TwelveData 분당 8회 한도는 **콜드 종목에만** 걸린다. 스캔은 순차이며 부분 결과를 즉시 반영한다 — 전체 완료를 기다리지 않는다.

## 6. 저장

`localStorage` 만 쓴다(계정 없음). **OHLC 는 저장하지 않는다** — AAPL 하나가 394KB 라 쿼터를 깬다(PC 백로그에 동일 판단 기록). 세션 메모리 캐시 + 서버 캐시에 의존한다.

```
ms_watchlist  [{ sym, name, addedAt }]
ms_scan       { [sym]: {
                 price,                       // 마지막 종가
                 chg,                         // 전봉 대비 % (소수 2자리)
                 spark: number[64],           // 최근 64봉 종가
                 dir: "bull"|"neutral"|"bear",// sign(verdict.score), |score|<8 이면 neutral
                 score,                       // verdict.score (−100..100)
                 confluence,                  // verdict.confluence 통째 {score, agree, total}
                                              // 행 배지는 .score 만 쓰지만 agree/total 을 버리지 않는다
                                              // ("15/27 동의" 같은 표현을 리포트에서 쓸 수 있다)
                 asOf,                        // 마지막 봉 날짜 YYYY-MM-DD
                 scannedAt                    // 스캔 시각 ISO
               } }
```

행의 신호 도트는 `dir`, 확신 배지는 `confluence` 다. 둘 다 스캔 시점의 값이며 실시간이 아니다 — `asOf` 배지가 그 사실을 드러낸다.

모든 접근은 try/catch 로 감싸고 실패 시 메모리 폴백한다(WebView 쿼터·프라이빗 모드).

## 7. 빈 상태 · 오류

- 첫 실행: 기본 3종목 **`AAPL` · `NVDA` · `MSFT`** 시드(빈 워치리스트 이탈 방지 — 시안 근거). 미국 대형주라 서버 캐시가 이미 데워져 있을 확률이 높아 첫 스캔이 빠르다. 온보딩 화면은 만들지 않는다
- 스캔 실패 행: 마지막 값 유지 + "갱신 실패" 배지. 화면을 비우지 않는다
- 오프라인: 캐시로 열린다
- 리포트에서 봉 부족(`MIN_BARS` 미달): 분석 대신 사유를 표시한다 — 빈 차트를 그리지 않는다

## 8. 파일 구조

```
mobile/www/
  index.html          앱 셸(고정 로드 순서, defer/async 없음)
  app.js              라우팅 · 화면 전환
  store.js            localStorage 래퍼
  scan.js             스캔 큐(순차 · 백오프 · 시계 주입)
  api.js              기존 + 티커 조회/제안         (확장)
  graph.js            기존 + basicGraph             (확장)
  chart-layout.js     패널 레이아웃 · 매퍼          (신규)
  chart-draw.js       캔들 · 콘 · 축 · 크로스헤어   (기존 chart.js 흡수)
  draw-layers.js      PC 포팅 — 가격 패널 오버레이·배지 5종 + 헬퍼 심  (신규)
  draw-panels.js      PC 포팅 — 서브패널 3종(머리 수술)                (신규)
  screens/watchlist.js
  screens/report.js
  ui.js               공통 조각(행 · 칩 · 배지)
  style.css
```

Phase 0 의 `chart.js` 는 `chart-layout.js` + `chart-draw.js` 로 분화한다. 한 파일에 두면 500줄이 네 가지 일을 하게 된다. 기존 `chart.test.mjs` 10건은 새 위치를 따라 옮긴다.

`spike.js` · Phase 0 의 `index.html`/`style.css` 는 삭제한다.

## 9. 테스트

순수 로직만 `node --test`(UMD 를 `createRequire` 로 읽는 Phase 0 방식 유지):

| 대상 | 무엇을 고정하나 |
|---|---|
| `chartLayout` | 패널 rect 합 = 높이 · 매퍼 왕복(`pToY(min/max)` = rect 경계) · 평탄 시리즈 NaN 없음 · 패널 생략 시 재배분 |
| `basicGraph` | 지표가 정확히 5종 · 엔진이 실제로 돈다 · 32종 그래프와 판정이 다르다 |
| `store` | 직렬화 왕복 · 쿼터 예외 시 메모리 폴백 · 구버전 키 무시 |
| `scan` | 순서 보존 · 실패 시 지수 백오프(시계 주입) · 부분 결과 콜백 |
| `draw-layers` | **recording-ctx 로 실제 페인트 단언** — MA 다중선 3색, 볼린저 밴드 채움 + 상하단 점선. 스파이크 기준선 MA 508콜 · 볼린저 621콜 |
| `draw-panels` | 같은 방식 — RSI 70/30 가이드와 라인, MACD 히스토그램 막대, 거래량 막대. 스파이크 기준선 RSI 990 · MACD 1449(fill 480) · 거래량 554 |

`draw-layers` 를 페인트 단언으로 검증하는 이유는 Phase 0 의 교훈이다 — 색이 반환값에는 맞는데 페인트에는 닿지 않던 사고가 이 저장소에 있었고, Phase 0 리뷰에서도 색 대응을 뒤바꿔도 통과하던 테스트가 잡혔다.

`app.js`·`screens/*` 는 순수 로직이 없는 배선이므로 테스트하지 않는다.

전체 관문은 `map/tests/run.sh` — 엔진을 건드렸다면 이 명령 하나로 PC 와 모바일이 같이 돈다.

## 10. 열린 항목 (Phase 1 이후)

- 봉 수 ↔ 정확도 실측 → Full 티어(v3) 전제
- **Full 이 비싼 진짜 원인** — 27개 중 어느 지표가 초선형인지 특정하면 "히스토리 절감" 대신 "그 지표 수정"이 답일 수 있다. v3 전에 한 번 프로파일
- Capacitor 툴체인 검증(Gradle 빌드 · APK 설치 · 폴드 펼침 액티비티 유지)
- 핀치줌 · 팬 · 전체화면 차트 · A/L 토글
- 폴드 2단 레이아웃(600–904dp)
- `?since=` 증분 시세
