# 실적(종목 이벤트) 축 엔진 제거 설계

- 날짜: 2026-07-17 · 상태: 승인됨 · 성격: 엔진 리팩터(기능 제거)
- 배경: 실적 인지 축(v1.9.6/1.9.7)은 갭+6.3/급변+3.4/변동성+2.6%p로 유일 실증된 외부데이터 승자였으나, **종목별 라이브 실적일 fetch(Nasdaq 프록시)에 엔진 출력이 의존**하는 리스크(외부 API 의존·미국주식 한정 비균일·재현 불가·불투명). 사용자 결정: **엔진을 가격 전용·재현가능으로 되돌린다**([[scoopforge-earnings-axis]]와 상충 — 이 문서로 축을 되돌림).
- 방식: **완전 제거**(feed-cut 아님) — forge-core에서 증강 모델 코드까지 절제.

## 1. 목표
세 예보 함수(`forecastVolatility`·`forecastSpike`·`forecastGapRisk`)를 **순수 가격 곡선 전용**으로 되돌리고, 실적일 라이브 데이터의 모든 유입 경로(클라 fetch·스레딩·프록시·알림규칙·배지)를 제거한다. 엔진 출력은 가격만으로 결정(재현가능·종목 균일).

## 2. 대상 (5개 파일)

### forge-core.js
- `forecastVolatility(price, candle, opts)` → `(price, candle)`. `_EVF_MEAN/STD/W/BB` 상수 제거. earnBars 분기(대표 대체) 제거. 반환에서 `earnAug` 제거(항상 곡선 rep=curve[1]).
- `forecastSpike(price, candle, opts)` → `(price, candle)`. `_ESPK_*` 제거. 분기·`earnAug` 제거.
- `forecastGapRisk(price, candle, opts)` → `(price, candle)`. `_EGAP_*` 제거. `_earnFeats` 함수 제거. 분기·`earnAug`·`earnBars` 반환 제거.
- `run()` 호출부(3곳): `{ earnBars, earnSince }` 인자 제거 → 함수 2인자 호출.
- 관련 주석(v1.9.6/1.9.7 실적 증강 서술) 정리.

### forge-core.test.js
- gap-risk 테스트 내 실적 증강 assert 블록(현 2185–2201: `base.earnAug`·`near`/`far`·`vE`/`sE`·`earnAug` 검증) 제거. **test() 개수 246 불변**(assert만 제거).

### forge-app.js
- 판정바 배지: `_vf.earnAug`(현 1515·1517)·`_spk.earnAug`(1536·1538)·`_gap.earnAug`/`earnLine`/`_gap.earnBars`(1545·1546·1548) 제거 → 항상 비증강 형태(평시/2주·1달·2달 배지).
- boot 프리페치(현 2102 `_loadEarnDate` 호출) 제거.
- `_loadEarnDate`·`_earnOpts`·`_bizDays`(현 2762–2786) 제거(`_bizDays`는 실적 경로 전용).
- `run`/`runSteps` opts의 `..._earnOpts()` 스프레드(현 2575·2850) 제거.
- 워치리스트 스캐너: `"earn"` ALERT_RULE(현 2214) 제거 + 스캐너 `earnD` 배관(현 2259·2261, `rule.when/msg`에 `{ earnD }`→`{}`) 정리.
- `_isUSStockSym`는 다른 소비처(상대강도·스캐너) 있으므로 **유지**.

### forge-api.php
- `?earndate=1` 핸들러 블록(현 178~) 제거. `forge_earn_cache_*.json`은 서버 생성·배포 불가침이라 코드만 제거(캐시파일 방치·무해).

### forge.html
- 캐시버스터 `forge-core.js?v=`·`forge-app.js?v=` bump(YYYYMMDD+suffix).

## 3. 검증
- `node --test forge-core.test.js` = **246/246 유지**(제거는 assert만·test 수 불변).
- grep으로 잔존 참조 0 확인: `earnBars|earnSince|earnAug|_earnFeats|_EVF|_ESPK|_EGAP|earndate|_loadEarnDate|_earnOpts|_bizDays`.
- 헤드리스 스모크: forge.html 로드→티커 노드→웹분석이 에러 없이 갭/급변/변동성 비증강 표시.

## 4. 격리 / 산출
- 순수 제거(신규 기능 없음). 엔진 판정력은 갭 −6.3%p 등 감소하나 재현가능·자립.
- 기록: 스코어카드 개선이력(실적 축 제거·이유 리스크)·백로그·메모리 [[scoopforge-earnings-axis]] 갱신(제거 사실·되돌리려면 git 이력).

## 5. 리스크
- **판정 감소**: 갭/급변/변동성 예보가 실적 임박 시 상향 안 됨. 의도된 트레이드오프(재현가능·리스크 제거 우선).
- **되돌리기**: 완전 제거라 되돌리려면 git revert. feed-cut보다 복원 비용 큼(사용자 인지·승인).
- **잔존 캐시**: `forge_earn_cache_*.json` 서버 방치(무해·불가침).
