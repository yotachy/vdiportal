# 다중스케일 구조 bias 검증 랩 (엔진 개선 후보) 설계

- 날짜: 2026-07-16
- 상태: 설계 승인됨 (구현 대기)
- 성격: **연구/검증 랩** (배포용 코드 아님) — 통과 시에만 엔진 승격
- 배경: [[scoopforge-multiscale-drawing]](작도는 완료, 엔진은 미착수) · [[scoopforge-retro-zone]](격리 랩 선례) · [[scoopforge-backlog-workflow]]·[[scoopforge-scorecard-changelog]] 규율
- 인프라: `map/backtest/direction-lab.js`(walk-forward 캡처 패턴) · `map/backtest/metrics.js`(directionHitRate·brierDecomp·baselines) · `fixtures/*-1day.json`(55종)

## 1. 목표 / 재프레이밍

작도(Gann·S/R·structure·trend·fib)는 다중스케일 위계로 통일됐으나 **엔진 bias/예측은 미착수**. 이 랩은 그 첫 후보로 **"다중스케일 구조 bias가 단일-최근스윙 구조 bias보다 OOS 방향 정확도를 실제로 높이는지"**를 격리 검증한다.

- **가설**: 구조 방향을 여러 스케일(대/중/소, `collectStructure` 티어)로 유의도 가중 합성하면 단일 `analyzeStructure.bias`보다 OOS 방향 적중이 순증가한다.
- **핵심 인지**: structure는 `run()` 드리프트 다수 중 하나(cap 0.08). 신호 단독이 나아도 **엔진 델타는 미미할 수 있음** — 그게 실제 승격 기준. **기각이 정상적·흔한 결과**(인터마켓·인트라데이·매크로 전례).
- **격리 = 베이스라인 불변**: forge-core에 **기본-off 검증 플래그 `opts._msStruct` 하나만** 추가(§3-B, `opts.draw` 동형·기본값에서 표준 동작 완전 동일·244 테스트 그대로). 이 외 로직·기본 동작·프로덕션 예측은 **불변**. 승격(플래그 기본 on 전환·baseline 이동)은 통과 시 **별도 결정**. 랩 로직·평가는 `map/backtest/`에 격리.

## 2. 다중스케일 구조 bias 공식 (랩 로컬)

```
structTierBias(t)  // analyzeStructure와 동일 매핑
  = t.event==="BOS_up"?0.6 : "BOS_down"?-0.6 : "CHoCH_up"?0.5 : "CHoCH_down"?-0.5
  : t.trend==="up"?0.3 : "down"?-0.3 : 0
multiScaleStructBias(price, opts)
  = clamp(-1,1, Σ(tier.significance × structTierBias(tier)) / Σ(tier.significance))
    over FC.collectStructure(price, opts).tiers   // 대/중/소 (SENS 0.12/0.06/0.03)
  = 0 if no tiers
```

- 단일 baseline = `FC.analyzeStructure(price,{swing}).bias` (현행 엔진, 전체 스윙 0.03).
- 랩 헬퍼 파일 `multiscale-struct.js`에 `structTierBias`·`multiScaleStructBias` (순수·단위테스트).

## 3. 랩 2단계 (`map/backtest/multiscale-struct-lab.js`)

`direction-lab.js` 패턴 준수: WARMUP 200 · LOOKBACK 600 · HORIZONS [3,5,10,20,40,60] · MAXH 60 · STRIDE 10 · fixtures/*-1day.json(55종). 각 시점 t에서 `price.slice(s0,t+1)` 창으로 계산, 실제방향 `sign(price[t+h]-price[t])`.

### A단계 — 신호 프리필터 (저렴, 먼저)
- 시점별 캡처: `single = sign(analyzeStructure.bias)`, `ms = sign(multiScaleStructBias)`, 자명규칙 특성(모멘텀 ret5/20/60·지속성 sl50/sl200·ma50/ma200), actuals[h].
- 평가: `single` vs `ms`의 지평별 방향 적중률(중립=부호0은 제외 또는 0.5 처리, direction-lab 관례 따름). **ms ≤ single이면 즉시 기각**(B 볼 것 없음).

### B단계 — 엔진 델타 (진짜 관문, A 통과 시)
- structure는 score에 **두 경로**로 기여: (1) 드리프트항 `stDrift = _struct.bias × trendScale × 0.08 × DW`(forge-core.js:2098), (2) combine 급전 `structSeries`(:291). 근사식으로 (1)만 빼고 더하면 (2)를 놓쳐 부정확 → **기각.**
- **정확·격리 준수 방법 = 기본-off 검증 옵션 플래그**: `run(graph, data, {timeframe, _msStruct:true})`일 때 **오직 line 2098의 `_struct.bias`만 `multiScaleStructBias(price, {..swingScale})`로 치환**(다른 모든 계산 동일). `opts.draw` 선례와 동형 — **기본 off라 표준 동작·베이스라인 불변**(`node --test forge-core.test.js` 244/244 그대로 검증). 이는 **검증 인프라**이지 승격이 아님(프로덕션 기본값 off 유지, 승격=별도 결정으로 기본 on 전환).
- 랩: 같은 창에서 `run(...,{_msStruct:false})` baseline vs `run(...,{_msStruct:true})` ms → 각 `sign(verdict.score)`의 지평별 적중률·BSS 비교.
- **sanity**: `_msStruct:false` 결과가 기존 backtest와 항등인지(무플래그 == 플래그off) 1회 확인.

## 4. 검증 관문 (풀 — `metrics.js` 재사용)

승격하려면 **전부** 충족:
1. **엔진 OOS 적중률(ms) > baseline(single)** — 지평별 순증분(3~5지평 다수 양수).
2. **> 자명규칙 최강치** — `baselines()`의 ±모멘텀·지속성 최고치 초과.
3. **BSS > 0** — `brierDecomp` 스킬 양수(베이스레이트 초과 정보성).
4. **LOSO 견고** — 종목 하나씩 홀드아웃, 종목별 순증분 분포·최악치 보고(대부분 양수).
5. **전/후반 양수** — 시계열 전/후반 분할 둘 다 순증분 양수(체리피킹 차단).

walk-forward(미래 미참조)·STRIDE로 자기상관 완화. 중립처리·표본수 리포트.

## 5. 결정

- **통과** → 별도 승격 계획(범위 밖): `analyzeStructure`에 다중스케일 옵션 + `run()` structDrift 반영 → **전체 backtest 재실행으로 baseline 이동 확인** → `validatedAxes` 등록 + 스코어카드 성적 갱신.
- **미달(가능성 높음)** → 스코어카드 **탐구표에 "다중스케일 구조 bias 기각(순증분/엔진델타 X)" 정직 기록**. 단일 유지. 랩·인프라 보존(재현 가능).

## 6. 비목표 (YAGNI)

- forge-core의 **기본 동작·baseline 변경**(추가는 기본-off 플래그 1개뿐; 승격=플래그 on은 통과 후 별도).
- pivot/gann/fib/trend 등 다른 신호의 다중스케일화(한 번에 하나 원칙 — structure만).
- 확률 캘리브레이션·콘·목표가 변경(방향 bias만).

## 7. 산출물 / 검증

- `map/backtest/multiscale-struct.js` + `multiscale-struct.test.js`(헬퍼 단위테스트: 티어 bias 매핑·가중합성·빈 티어·클램프·결정성).
- `map/backtest/multiscale-struct-lab.js`(캡처+A/B 평가+게이트 리포트) → `multiscale-struct-records.json` + 콘솔 리포트.
- `forge-core.js`: `run()`에 `opts._msStruct` 게이트 1개(기본 off, line 2098 치환만) + `multiScaleStructBias` 관련은 랩 파일이 자체 구현(또는 forge-core export 재사용). **기본 동작·baseline 불변.**
- **최종 산출 = 판정**: 통과/기각 + 근거 숫자. 승격(플래그 기본 on)은 통과 시 별도.
- 회귀: **`opts._msStruct` off일 때 표준과 동일** → `node --test map/forge-core.test.js` 244/244 그대로 + 랩 헬퍼 신규 테스트.

## 8. 리스크

- **엔진 델타 미미**: structure 기여 cap 작아 신호개선이 엔진에 안 묻힐 수 있음 → 플래그 on/off 정직 측정, 미달이면 기각.
- **플래그 오염 방지**: `_msStruct` off일 때 표준과 완전 동일해야 함 → 244 테스트 + 랩 sanity(off==무플래그) 이중 확인. 치환은 line 2098 한 곳만.
- **표본**: 55종 KR 위주 — LOSO·전후반으로 견고성 보강. 다지역 fixtures-bench 추가는 선택.
