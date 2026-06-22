# ETH 기관·시그니처 지표 3종 설계 문서

- 작성일: 2026-06-22
- 대상 파일: `signal/scoopsignal.html` (단일 정적 HTML 유지)
- 성격: ETH 전용 지표 3종(기관 보유 Basic + 트리거 보드·공급압력 지수 Signature) 표시전용 추가. 점수 산식 불변.

## 1. 배경 / 목적

이더리움 전용 신호 지표를 더한다. ETF 일일 순유입(Farside/SoSoValue)은 CORS·키 제약으로 프록시(Cloudflare Worker)가 선행돼야 해 **별도 진행**으로 분리하고, 지금 무료·CORS로 가능한 3종을 먼저 만든다. 스쿱시그널이 자체 합성한 지표(트리거 보드·공급압력)는 **Signature**로 표기.

## 2. 목표

- 신규 사이드 그룹 **"기관·플로우"** + 3개 표시전용 뷰: `treasury`(Basic) · `trigger`(Signature) · `squeeze`(Signature).
- `loadTreasury()`(CoinGecko public_treasury, 캐시) 추가. 트리거·공급압력은 **기존 S.\*** 재사용.
- `CHART_TIER`: treasury=basic, trigger·squeeze=signature(골드 배지·아이콘).
- 점수 산식·뷰 라우터 골격·기존 지표 불변. 그레이스풀.

## 3. 비목표 (YAGNI)

- ETF 일일 순유입(프록시 별도 사이클). 점수 편입. 결제.

## 4. 데이터

| 소스 | 반환(요지) | 용도 |
|---|---|---|
| CoinGecko `/companies/public_treasury/ethereum` (노키·CORS ✅) | `{total_holdings, total_value_usd, market_cap_dominance, companies:[{name,symbol,total_holdings,total_current_value_usd,...}]}` | 기관 보유·기업별·공급 비중 |
| 기존 `S.us` | 공급 시계열·스테이킹·소각 | 디플레·스테이킹 잠김 |
| 기존 `S.band/S.ma200/S.ethbtc/S.roc/S.netLiq/S.queue` | 밴드·200주·ETH/BTC·ROC·순유동성·검증자 큐 | 트리거 조건 |

- `loadTreasury()` → `S.treasury={total,usd,dom,companies}`. try/catch → `S.treasury=null`+`setStatus('treasury','warn')`. **캐시 20분**(스냅샷, 자주 안 변함 — Upbit 캐시 패턴 동일: `S._trAt`).

## 5. 컴포넌트 설계

### 5.1 사이드 그룹 + 3 뷰

온체인·네트워크 그룹 뒤에 신규 그룹 "기관·플로우" + 3항목(듀오톤 아이콘: treasury=빌딩/금고, trigger=신호등/체크, squeeze=압축화살표). 각 뷰는 패턴 뷰 골격(`.page-head` + 본문). 사이드바 직접 진입.

### 5.2 `treasury` — 기관 ETH 보유 (Basic)

- 본문: 상단 통계(`#treasuryStats`: 총 보유 M ETH · $B · 공급 비중 %) + **기업별 막대 리스트**(`#treasuryList`): 상위 ~12개 회사, 각 행 `회사명 · 보유 막대(최대 대비) · 보유량/$`.
- 데이터: `S.treasury`. 없으면 "연결 필요".

### 5.3 `trigger` — 강세 전환 트리거 보드 (Signature)

8개 트리거, 각 boolean. 점등 개수로 종합 신호.

| # | 트리거 | 점등 조건 | 소스(가드) |
|---|---|---|---|
| 1 | 디플레 | 공급 30d 변화 ≤ 0 | S.us.series |
| 2 | 밴드 저평가 | S.band.z < −0.5 | S.band |
| 3 | 200주 저평가 | pctRank(S.ma200.hist, S.ma200.mult) < 0.3 | S.ma200 |
| 4 | ETH/BTC 강세 | S.ethbtc.dist > 0 && S.ethbtc.slope > 0 | S.ethbtc |
| 5 | 모멘텀 ROC+ | S.roc.now > 0 | S.roc |
| 6 | 순유동성 개선 | S.netLiq.chg > 0 | S.netLiq |
| 7 | 검증자 순유입 | S.queue.enter > S.queue.exit | S.queue |
| 8 | 기관 보유 高 | S.treasury.dom ≥ 6 | S.treasury |

- 각 트리거 = 카드/행(`.trig`), 점등=초록(bull)·소등=회색. 사용 불가(소스 없음)=중립 표시.
- **종합**(`#triggerSummary`): 점등 N/8 → `≥5 강세 전환 유력 / 3~4 혼조 / ≤2 약세 우위`. 게이지/숫자.
- 함수 `renderTriggers()` — 각 조건 평가(가드: 해당 S.* 없으면 그 트리거 '대기'로 제외 카운트). 표시전용(점수 미반영).

### 5.4 `squeeze` — ETH 공급압력 지수 (Signature)

- **0~100** = 3요소 평균(각 0~100, lerp; 히스토리 짧아 고정 임계값):
  - **순발행 압력**: 공급 30d 변화%(`(supplyNow/supply30dAgo−1)*100`) → `lerp([[0.5,15],[0.1,40],[0,55],[-0.1,75],[-0.4,92]], chg)` (디플레일수록↑).
  - **스테이킹 잠김**: 비율%(stakedEth/supplyNow*100) → `lerp([[20,25],[28,50],[33,68],[40,90]], ratio)`.
  - **기관 흡수**: 공급 비중%(S.treasury.dom) → `lerp([[2,30],[4,48],[6,62],[10,88]], dom)`.
- 평균 → 게이지/링(`#squeezeGauge`) + 3요소 분해 막대(`#squeezeStats`). 높을수록 유통 물량 압박(강세 우호).
- 함수 `renderSqueeze()`. 요소 데이터 없으면 가용분만 평균(없으면 "연결 필요"). 표시전용.

### 5.5 라우터/배지/등급

- `treasury`·`trigger`·`squeeze`는 캔버스 없음(DOM/SVG 링) → `VIEW_DRAW` 미등록. `recompute()`(또는 renderInstitutional)에서 `renderTreasury/renderTriggers/renderSqueeze` 호출(매 recompute 갱신, DOM이라 숨김 무관).
- `CHART_TIER`에 `treasury:'basic', trigger:'signature', squeeze:'signature'` → 헤더 배지 + 네비 Signature 골드 아이콘 자동.
- `updateSideBadges`: treasury(공급 비중%)·trigger(N/8)·squeeze(지수) 현재값 배지.
- `loadTreasury()` → `refresh()` allSettled 추가, 상태 `#st-treasury` "기관".

## 6. 그레이스풀

- CoinGecko treasury 실패 → treasury/squeeze(기관 흡수)/trigger#8 디그레이드, 나머지 정상.
- 트리거/공급압력은 가용 S.*만으로 부분 계산(없는 조건/요소 제외). 한 소스 실패가 전체를 안 깸.

## 7. 엣지/주의

- 디자인 토큰만, `html{zoom:1.35}` 유지, 한국어, 좌측 컬러바 금지(아이콘 면). 들여쓰기 2 spaces.
- lerp 임계값은 휴리스틱(기존 유동성 lerp와 동일 성격) — 추후 튜닝 가능. 표시전용이라 종합 점수 미오염.
- treasury 캐시 20분(Upbit 캔들 캐시 패턴 재사용). 공급 30d 변화는 S.us.series에서 30일 전 포인트 탐색(일 단위 d1 아닌 since_merge면 인덱스 보정 — 가장 가까운 30일 전 시각 탐색).
- 트리거/요소 평가는 해당 S.* 존재 가드 필수(미존재 시 NaN 방지).

## 8. 검증

- 사이드 새 그룹 "기관·플로우" + 3항목(아이콘·배지). 헤더: treasury=Basic, trigger·squeeze=Signature(골드) 배지.
- `treasury`: 총 보유·비중 + 기업별 막대. `trigger`: 8조건 점등판 + N/8 종합. `squeeze`: 지수 게이지 + 3요소 분해.
- 헤드리스(Binance 차단=한국): CoinGecko treasury 로드 시 값, 실패 시 디그레이드. 기존 점수·차트 회귀 0, JS 에러 0.
- 스크린샷 육안 확인.
