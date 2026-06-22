# ETH 온체인·네트워크 지표 4종 설계 문서

- 작성일: 2026-06-22
- 대상 파일: `signal/scoopsignal.html` (단일 정적 HTML 유지)
- 성격: ETH 고유 지표 4종을 표시전용 뷰로 추가 + 신규 데이터 로더. 점수 산식·뷰 라우터 골격 불변.

## 1. 배경 / 목적

크립토시그널에 "이더리움만의" 지표를 더한다. 무료·CORS 가능 소스로 실현성을 사전 검증(헤드리스 fetch)한 결과:

- **ultrasound.money API** — CORS 통과·노키 확인. `supply-over-time`(공급 히스토리), `fees/all`(burnRate·baseFeePerGas), `effective-balance-sum`(스테이킹 물량) 제공.
- **DeFiLlama `/v2/chains`** — 이미 `loadLlama`가 받음. ETH DeFi 지배력 산출 가능.
- beaconcha.in(CORS 차단)·Etherscan(V2+키 필요)는 사용 불가 → ultrasound.money로 대체.

추가 지표 4종(모두 표시전용, 점수 미반영): 순발행·공급, 가스·수수료, 스테이킹 비율, ETH DeFi 지배력.

## 2. 목표

- 사이드바에 **신규 그룹 "온체인·네트워크"** + 4개 항목(듀오톤 아이콘 + 현재값 배지).
- 4개 **표시전용 뷰**(`supply`/`gas`/`staking`/`defidom`). `CHART_TIER`에 **Basic**으로 등록.
- `loadUltrasound()` 신규(3 엔드포인트) + DeFi 지배력은 `loadLlama` 데이터 재사용. 그레이스풀 디그레이드.
- 점수 산식·기존 지표·뷰 라우터 골격 불변.

## 3. 비목표 (YAGNI)

- 점수(펀더멘털 등) 편입 — 나중(로드맵).
- 결제/게이팅. Etherscan·beaconcha 의존.

## 4. 데이터 소스 (검증 완료)

| 엔드포인트 | 반환(요지) | 용도 |
|---|---|---|
| `https://ultrasound.money/api/v2/fees/supply-over-time` | `{d1:[{supply,timestamp}…]}` 공급 시계열 | 순발행·공급 라인 |
| `https://ultrasound.money/api/fees/all` | `{baseFeePerGas, burnRates:{burnRate24h/7d/30d…(wei/s), …Usd}, feeBurns, deflationaryStreak}` | 가스·수수료, 소각률 |
| `https://ultrasound.money/api/v2/fees/effective-balance-sum` | `{sum: <Gwei>}` 총 유효 스테이킹 잔액 | 스테이킹 비율 |
| DeFiLlama `/v2/chains` (loadLlama 기존) | 체인별 `tvl` 배열 | ETH DeFi 지배력 |

단위 주의: ultrasound 값은 wei/Gwei. 공급은 ETH 단위(supply 필드 그대로 ETH). effective-balance-sum `sum`은 Gwei → `/1e9` = ETH. burnRate는 wei/s → 연율 ETH 환산 시 `×31.536e6초/1e18`.

## 5. 컴포넌트 설계

### 5.1 사이드바 그룹 + 항목

밸류·리스크 그룹의 마지막 항목(변동성) 뒤에 추가:
```
<div class="snav-group">온체인·네트워크</div>
순발행·공급(supply) · 가스·수수료(gas) · 스테이킹 비율(staking) · DeFi 지배력(defidom)
```
- 각 항목 `[듀오톤 아이콘][라벨][현재값 배지]` (기존 `.snav-main`/`.snav-ic`/`.snav-badge` 구조).
- 아이콘(듀오톤, currentColor 2레이어): supply=공급/코인더미, gas=불꽃/연료, staking=잠금/지분, defidom=점유 파이.

### 5.2 4개 뷰 (표시전용, 패턴 뷰와 동일 골격)

각 `<section class="view" data-view="{key}">` = `.page-head`(제목+설명+현재값 통계 `#*Stats`) + 본문. 사이드바 직접 진입(백링크 없음, 패턴 뷰와 동일).

- **`supply` 순발행·공급**: `<canvas id="cvSupply">` 라인차트(ultrasound supply-over-time `d1` → supply(ETH) 시계열). 기존 `lineChart` 재사용(x=연/월, y=공급 M, 현재값 마커). 통계: 현재 공급·30d 변화·디플레 여부(deflationaryStreak)·연율 소각률.
- **`gas` 가스·수수료**: 캔버스 없음. 현재값 스탯 카드(`#gasStats`): 기준 가스(baseFeePerGas gwei) + 소각률(24h/7d/30d, 연율 ETH·USD) + 디플레 스트릭. `.fc`/`.mrow` 재사용.
- **`staking` 스테이킹 비율**: 캔버스 없음. 현재값(`#stakingStats`): 스테이킹 비율 %(=effective-balance-sum ETH / 총공급), 스테이킹 ETH 물량, 의미 한 줄. (총공급은 supply-over-time 최신 supply 사용.)
- **`defidom` ETH DeFi 지배력**: `<canvas id="cvDefiDom">` ETH TVL 추이 라인(기존 `S.tvl.series` 재사용) + 통계(`#defidomStats`): 현재 ETH DeFi 지배력 %(ETH TVL / 전체 체인 TVL 합), ETH TVL($B), 30d 변화.

### 5.3 데이터 로더

- `loadUltrasound()` 신규: `Promise.all`로 위 3 엔드포인트 → `S.us = {supplySeries:[{t,supply}], baseFeeGwei, burnRate:{d1,d7,d30}, deflStreak, stakedEth}`. try/catch → 실패 시 `S.us=null` + `setStatus('ultrasound','warn')`, 성공 `'ok'`.
- DeFi 지배력: `loadLlama` 내에서 기존 `chains` 배열로 `ethTvl = chains.find(name==='Ethereum').tvl`, `totalTvl = sum(chains.tvl)` → `S.defidom = {pct: ethTvl/totalTvl*100, ethTvl}`.
- `refresh()` `Promise.allSettled([...])`에 `loadUltrasound()` 추가. 상태 푸터에 `#st-ultrasound` "온체인" 추가.
- `recompute()`(또는 별도 `renderOnchain()`): `S.us`/`S.defidom`로 4뷰 통계·차트·사이드 배지 갱신. 활성 뷰가 캔버스(`supply`/`defidom`)면 그릴 때만(`VIEW_DRAW` 등록 — SVG 아닌 canvas라 표시 후 렌더 필요).

### 5.4 라우터/배지/등급

- `VIEW_DRAW`에 `supply:drawSupply, defidom:drawDefiDom` 등록(캔버스). `gas`/`staking`은 캔버스 없음 → 미등록(통계는 recompute/renderOnchain이 채움).
- `CHART_TIER`에 `supply:'basic', gas:'basic', staking:'basic', defidom:'basic'` 추가 → 페이지 헤더 Basic 배지 자동(`applyTierBadges`).
- `updateSideBadges()`에 4개 현재값 배지 추가(예: 디플레±%/가스 gwei/스테이킹%/지배력%).

## 6. 그레이스풀 디그레이드

- ultrasound 실패: `supply`/`gas`/`staking` 뷰 통계 "연결 필요", 사이드 배지 —. 차트는 빈 상태 가드.
- DeFiLlama 실패: `defidom`도 동일.
- 한 소스 실패가 나머지(가격·점수)에 영향 없음(`Promise.allSettled`).

## 7. 엣지/주의

- 디자인 토큰만, `html{zoom:1.35}` 유지, 한국어 UI, 좌측 컬러바 금지(아이콘 면). 들여쓰기 2 spaces.
- 단위 환산 정확히(wei/Gwei→ETH, wei/s→연율). 큰 수 `Number` 정밀도 주의(공급 1.2e8 ETH는 안전, burnRate wei는 1e16~ → Number 안전 범위).
- 캔버스 0크기: `supply`/`defidom`는 활성화 후 그리기(`VIEW_DRAW`/`drawActiveView` 기존 패턴).
- ultrasound 3rd-party 단일 의존 — 차단/포맷 변경 시 3뷰 동시 영향. 방어적 파싱(필드 없으면 디그레이드).
- supply-over-time `d1` 범위가 짧으면(최근만) 라인이 단기. 가용 범위 그대로 표시(설명에 명시).

## 8. 검증

- 사이드바 새 그룹 "온체인·네트워크" + 4항목(아이콘·배지). 4뷰 진입.
- `supply`: 공급 추이 라인 + 디플레/소각률 통계. `gas`: 기준가스·소각률 스탯. `staking`: 비율 %·물량. `defidom`: 지배력 %·ETH TVL 추이.
- 헤드리스: JS 에러 0, ultrasound 로드 시 값 표시(차단 시 디그레이드 확인), 기존 점수·패턴 뷰 회귀 없음.
- `CHART_TIER` Basic 배지 4뷰 노출, 사이드 현재값 배지 4개.
- 스크린샷 육안 확인.
