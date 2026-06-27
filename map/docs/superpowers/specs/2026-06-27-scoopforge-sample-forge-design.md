# 스쿱포지 — "BTC/USD 분석" 풀 샘플 포지 설계

- 날짜: 2026-06-27
- 선행: Phase 5-B(R5b) 비전 작업큐 MVP 배포 완료.
- 목적: 차트+노드 분석 기능이 **실제로 동작하는** 모범 샘플 포지를 기본 제공 — 사용자가 메인 차트·노드별 이미지·실제 계산값·서술을 보고 따라 만들 수 있게.

## 0. 결정 (브레인스토밍)

1. **전달 형태 = 기본 시드 내장**: `seedDefaultStrategy()` 본문을 샘플 빌더로 교체 + 노드/메인 이미지를 forge.html 빌트인 base64로 내장(자체완결·재현 100%). 레거시 VDI 시드 대체(제품 방향 일치).
2. **시나리오 = BTC/USD 일봉**: 상승추세 + 조정 + 반등. 파동·엘리어트·RSI·피보나치가 잘 드러나는 케이스.
3. **범위 = 풀 세트 10노드**: price + 6분석(ma·phasefold·rsi·fib·trend·elliott) + combine + predict + 메모. 모든 블록 타입 시연.
4. **값/서술 = 실제 계산 검증**: 시각만이 아니라 forge-core로 실제 계산해 노드 서술의 수치가 시계열과 일치(거짓값 0).

## 1. 아키텍처

`buildSampleForge()` 단일 빌더가 다음을 한 번에 생성:
- 9블록 DAG + 메모 노드(좌→우 흐름, autoLayout 친화 좌표).
- 각 노드의 `thumb.imgId`(빌트인 미니 차트) · `conviction` · `weight` · `desc`(서술).
- 대표 이미지 `themeImgId = "smp_main"`(메인 BTC 차트).
- 베이크된 BTC 샘플 시계열을 R5b `doc.vision = {series, bias, note, waves}` 형태로 첨부.

이 빌더를 두 진입점에서 사용:
- **빈 부팅 시드**: `seedDefaultStrategy()` → `buildSampleForge()` 호출(빈 데이터/오프라인에서 기본 표시).
- **온디맨드**: 사이드바 `＋ 샘플 포지` 버튼 → 같은 빌더로 새 포지 1개 추가(기존 데이터 비파괴).

```
buildSampleForge()
  ├─ boardState.nodes/edges (10노드 DAG)         → renderBoard
  ├─ themeState.imgId = "smp_main"               → renderHero
  ├─ doc.vision = {series(BTC), bias, note, waves} → loadDoc 복원 → currentData()
  └─ (빌트인 IMAGES: smp_main, smp_ma, smp_wave, smp_rsi, smp_fib, smp_trend, smp_elliott, smp_predict)
runForge() → ForgeCore.run(graph, currentData(), {visionBias}) → 실제 시그널/예측/배지
```

## 2. 노드 구성 (BTC/USD, 상승추세+조정)

좌표는 autoLayout('v')로 정리되므로 대략값. conviction(−100~100, 방향)·weight(0~100, 중요도)는 시그널을 실제로 기울인다.

| # | 노드 | kind/blockType | params | thumb imgId | 실제 값(계산) | desc(서술) | conv | weight |
|---|---|---|---|---|---|---|---|---|
| 1 | 가격 | block/price | — | smp_main | 종가 시리즈 | "BTC/USD 일봉 — 상승추세 속 단기 조정 구간" | 0 | 50 |
| 2 | 이동평균(20) | block/ma | {len:20} | smp_ma | MA20 vs 종가(빌드시 계산) | "가격이 MA20 상회 — 추세 지지 유효" | +40 | 55 |
| 3 | 파동 스캔 | block/phasefold | {pmin:16,pmax:128} | smp_wave | 배지 P*≈/θ(자동) | "지배 주기 검출 — 다음 저점 구간 추정" | 0 | 60 |
| 4 | RSI(14) | block/rsi | {period:14} | smp_rsi | RSI 최근값(계산) | "과매수 근접 — 단기 과열 신호" | −20 | 50 |
| 5 | 피보나치 | block/fib | {len:120} | smp_fib | 0.382/0.5/0.618(계산) | "0.618 되돌림 지지 확인 후 반등" | +30 | 50 |
| 6 | 추세선 | block/trend | {len:40} | smp_trend | 기울기/방향(계산) | "상승 회귀선 — 우상향 추세 유지" | +35 | 70 |
| 7 | 엘리어트 | block/elliott | {swing:3} | smp_elliott | 배지 파동/방향(자동) | "5파 진행 추정 — 상승 후반 경계" | +25 | 55 |
| 8 | 가중결합 | block/combine | — | — | 가중 합성 시그널 | "소스별 weight 가중 결합" | 0 | 50 |
| 9 | 예측·시그널 | block/predict | — | smp_predict | path/lo/hi·국면(출력) | (예측 산출) | 0 | 50 |
| 10 | 포지 메모 | free | — | — | — | "종합: 상승 우세. RSI 과열로 단기 조정 가능하나 추세선·피보 지지로 추가 상승 시나리오 우위." | 0 | 50 |

**엣지(DAG)**: price→ma, price→phasefold, price→rsi, price→fib, price→trend, price→elliott → 모두 combine → predict. (메모는 자유 노드, 맥락.)

**값 진위**: ma/rsi/fib/trend 서술의 수치는 빌드 시 `ForgeCore`로 샘플 시계열에 대해 실제 계산해 채운다(또는 정성 서술로 두되 시계열 형상과 모순 없게). phasefold/elliott는 `paintScanBadges`가 자동 계산.

## 3. 이미지 (빌트인 base64)

헤드리스 chrome(캔버스 렌더, R5b E2E와 동일 방식)로 8장 생성 → forge.html `IMAGES` 맵에 빌트인 base64로 내장. 다크 네이비 배경 + 골드/그린 팔레트(테마 일치). JPEG로 용량 절감.

| imgId | 내용 | 대략 크기 |
|---|---|---|
| smp_main | BTC/USD 일봉 메인(상승+조정+반등, 타이틀/축) — 대표 이미지 | ~600×360 |
| smp_ma | 가격 + MA20 오버레이 | ~240×140 |
| smp_wave | 주기 폴드(사인 주기) | ~240×140 |
| smp_rsi | RSI 오실레이터(70/30 라인) | ~240×140 |
| smp_fib | 가격 + 피보 되돌림 수평선 | ~240×140 |
| smp_trend | 가격 + 회귀 추세선/채널 | ~240×140 |
| smp_elliott | 1~5 파동 라벨 | ~240×140 |
| smp_predict | 예측 콘(미래 존) | ~240×140 |

- 빌트인이므로 서버 `forge_images.json` 미오염(POST 128KB 무관). 노드는 `thumb.imgId` 참조만 저장 → 저장 POST 경량.
- forge.html 용량 +~100KB 예상(허용). export/import·오프라인에서도 그대로 렌더.

## 4. 동작 / 영속

- **샘플 시계열 구동**: 결정적 BTC 시계열(약 480pt)을 `doc.vision`에 베이크 → `loadDoc` 복원 → `currentData()` 반환 → `run`/`runSteps`가 실제 계산(시그널·국면·예측 콘·파동/엘리어트 배지). `▷ 포지 분석` 재생도 이 데이터로 단계 누적.
- **conviction/weight 반영**: 표의 conv/weight가 `aggregateConviction`·가중결합에 실제 들어가 시그널/국면을 기울이고, 노드 글로우·배지(weight≠50)로 시각화.
- **빈 부팅 시드 교체**: `seedDefaultStrategy()` 본문을 `buildSampleForge()`로 교체. autoLayout('v') 후 기본 세로 배치.
- **기존 사용자 비파괴**: 사이드바 `＋ 샘플 포지` 버튼 → 새 포지 1개 추가(`newDoc` 유사 흐름이되 빌더로 채움). 기존 포지/서버 데이터 불가침.
- **자체완결**: 이미지 빌트인 → 새로고침/오프라인/내보내기에서 그대로. 저장은 `thumb.imgId` 참조만.

## 5. 검증

- **빌더 단위(node, forge-core)**: `buildSampleForge()` graph+series로 `run()`이 에러 없이 계산 — `signal.length===series.n`, `prediction.path.length===futW`, phasefold/elliott meta 존재. conv/weight가 시그널을 실제로 기울이는지(±) 확인. node 테스트 1~2건 추가(기존 23 유지 → 24+).
- **값 진위**: 빌드 시 계산값 vs 노드 서술 수치 대조(거짓값 0).
- **헤드리스 렌더**: 샘플 포지 로드 → 10노드 + 각 썸네일·대표 이미지 표시, 스캔 배지 채워짐, 예측 콘 그려짐, 콘솔 에러 0. `＋ 샘플 포지` 버튼 동작.
- **재생**: `▷ 포지 분석`이 샘플 데이터로 누적·수렴.
- **비파괴**: forge_data/images.json 불가침, 빌트인 이미지 forge.html 내장(서버 미오염).
- **배포**: forge.html(+필요시 forge-core.js) → cafe24 `www/map/`.

## 6. 비범위

- 실시간 시세·다중 종목·OHLC 임포트(샘플은 결정적 베이크 시계열).
- 이미지 위 정밀 보조선(R5b-2) — 샘플은 미니 차트 썸네일 수준.
- 신규 블록 타입(현 9블록으로 충분).

## 7. 산출물 요약

| 파일 | 변경 |
|---|---|
| `forge.html` | `buildSampleForge()` 추가 + `seedDefaultStrategy` 교체 + 빌트인 8 이미지(base64) + `＋ 샘플 포지` 버튼 |
| `forge-core.js` | 변경 없음(기존 run/runSteps/블록 사용). 빌더 검증용 테스트만 `forge-core.test.js`에 추가 가능 |
| (생성 스크립트) | 이미지 생성용 임시 헤드리스 스크립트(스크래치, 배포 제외) |
