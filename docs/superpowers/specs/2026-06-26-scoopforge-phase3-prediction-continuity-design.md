# 스쿱포지 (Scoop Forge) Phase 3-C — 예측 연속성(gap 제거) 설계

- 날짜: 2026-06-26
- 선행: Phase 2(중요도 weight + 기술 블록) 배포 완료.
- 상태: 컨셉 합의 완료 → 구현 설계. **4-서브프로젝트 분해 중 첫 덩어리(C).**

## 0. 범위 분해(상위 맥락)

사용자 요청은 4개 독립 서브시스템 — 순서 **C → A+B → D**:
- **C(본 문서)**: 예측 연속성 — 현재 차트 마지막 값에서 예측이 이어져 그려짐(gap 제거).
- **A**: 서버 저장(forge 전용 `api.php`+`forge_data.json`/`forge_images.json`, map 패턴 복제, map 파일 불가침).
- **B**: map.html식 좌측 사이드바 — 문서(주제 이미지+제목) 관리 + 이미지 라이브러리 사이드바 이전.
- **D**: Claude Code Opus 분석 트리거(서술·의견 → 예측 반영). **서버 작업큐(①)+예약 루틴(③)** 둘 다, 반영은 **바이어스/가중 조정(①)+예측 경로 보정(②)** 둘 다. A(서버)에 의존 → 마지막.

(A/B/D는 각자 별도 spec→plan 사이클. 본 문서는 C만.)

## 1. C 목표

`run()`의 예측 경로가 **마지막 실제 종가에서 연속**되도록 앵커링하고, 신뢰구간을 seam에서 좁게 시작해 확대. 차트/오버레이가 seam 지점에서 예측선·콘을 이어 그림. → "지금" 경계의 점프 제거.

## 2. 코어 변경 (`forge-core.js` `run`)

- 예측 외삽에 쓰는 동일 공식으로 **마지막 실값 인덱스(n−1)의 모델값** `modelAtLast` 계산:
  `modelAtLast = a + b*(n-1) + (fmeta ? Math.sin(2π*(n-1)/P)*res*0.8 : 0)`.
- `offset = price[n-1] − modelAtLast`. 모든 path 값에 `offset` 가산 → 모델이 마지막 종가를 정확히 통과.
- path 생성은 기존대로 `i = n-1+k`(k=1..futW), `v = a+b*i + (fmeta? cyc : 0) + offset`.
- **신뢰구간**: seam에서 좁게 시작 → 확대. `band = res*(0.15 + 0.03*k)` (현재 `0.6+0.02*k` 대체). `lo=v−band`, `hi=v+band`.
- 반환에 `prediction.anchor = price[n-1]` 추가(차트 seam 연결용). 기존 `path/lo/hi/futW` 유지.
- conviction 바이어스/verdict 등 다른 로직 불변. 기존 node 테스트 유지.

## 3. 렌더 변경

- **`forge.html` `fcDrawMain`**: 예측선 stroke와 lo/hi 콘 폴리곤을 **seam(predStartX, toY(prediction.anchor ?? lastClose))에서 출발**하도록 연결(첫 path 점 앞에 anchor 점을 prepend). 기존 seam dot 유지.
- **오버레이 `drawCone`(forge.html)**: 콘 채움도 동일하게 seam(anchor)에서 시작하도록 시작점 보정(메인 차트와 정렬).
- anchor 미존재(구버전 결과) 시 `candles[n-1].c`로 폴백(graceful).

## 4. 데이터/계약

- `run` 반환: `{ ..., prediction:{ path, lo, hi, futW, anchor } }`. `anchor`만 신규(가산). 하위호환(anchor 없으면 차트가 lastClose 폴백).

## 5. 테스트 (node, 결정적)

선형+사인 가격(예: `100 + 0.5*i + 3*sin(2πi/40)`, n=240) + `price→phasefold→combine→predict` 그래프로 `run(futW:60)`:
- `prediction.anchor === price[n-1]`.
- `Math.abs(path[0] − anchor) < Math.abs(path[futW-1] − anchor)` (시간에 따라 멀어짐 = 점프 아님).
- `(hi[0]−lo[0]) < (hi[futW-1]−lo[futW-1])` (밴드 확대).
- `path/lo/hi` 전부 유한, 길이 === futW.
- 기존 14개 테스트 유지.

## 6. 비범위

- A(서버)/B(사이드바)/D(분석 트리거)는 본 사이클 제외. 가격은 여전히 데모/임포트(실데이터 아님). 주제 이미지의 픽셀을 실제 OHLC로 파싱하지 않음(C는 우측 합성 차트의 연속성만).

## 7. 리스크/주의

- `modelAtLast`는 forecast 루프와 **정확히 같은 공식**이어야 offset이 의미 있음(공식 중복 → 헬퍼로 묶거나 주석으로 동기 명시).
- 차트 seam 연결 시 좌표 매핑(`toX/toY`, `predStartX`)은 기존 `fcDrawMain` 것을 재사용(새 매핑 금지 — Phase 2 오버레이 교훈).
- 단일 페이지·바닐라·노드 테스트·헤드리스 검증 관례 유지. 기존 `map.html`·`chart.html` 불가침. noindex.

## 8. 확정된 결정

1. 연속성: 마지막 실값 앵커링(offset) + 밴드 seam에서 좁게 시작.
2. 차트/오버레이 모두 seam에서 예측 시작(메인 좌표 재사용).
3. `prediction.anchor` 신규 반환(하위호환 가산).
