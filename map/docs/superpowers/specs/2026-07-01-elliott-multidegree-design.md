# 엘리어트 다중 degree (소형 + 대형 전체차트 파동) — 설계

- 작성일: 2026-07-01
- 대상: 스쿱포지(Scoop Forge) — `forge-core.js`(분석) + `forge.html`(hero 작도·배지)
- 선행: 도구 심화 6지표(엘리어트 `analyzeElliott`/`elliottAnalyze` 단일출처) · 트레이딩뷰식 차트 데이터-윈도(최대 5000봉)·오토스케일 배포됨.
- 상태: 설계 승인됨 (구현 계획 대기)

## 1. 배경 / 문제

`analyzeElliott`(및 결합 기여 변형 `elliottAnalyze`)는 `detectSwings(price, swing)`로 변곡점을 찾은 뒤 **마지막 8개 다리만**(`legs.slice(-8)`) 1·2·3·4·5·A·B·C로 라벨링한다. 데이터-윈도 도입으로 봉이 최대 5000개까지 늘어났고, 기본 스윙 3%(`params.swing:3`→0.03)면 변곡점이 수십~수백 개 잡혀 **마지막 8개는 차트 맨 끝의 짧은 최근 구간**만 덮는다. 결과적으로 "큰 그림(상위 degree)" 파동이 보이지 않아 제대로 된 엘리어트 분석이 안 된다.

## 2. 목표

**소형(minor·현행 최근) degree는 그대로 유지**하고, **차트 전체를 덮는 대형(primary) degree 파동을 함께 작도·분석**한다(2단계 동시). 대형은 ① hero에 함께 그려지고, ② 예측 방향(드리프트)에 가중 반영되며, ③ 노드 배지에 함께 표기된다. 결합(combine) 기여도 수학과 소형 동작은 건드리지 않는다(회귀 0).

핵심 합의:
- **degree 수: 2** (소형 + 대형).
- **표시: 다중 degree 동시** (겹쳐 그림).
- **예측 결합: 큰그림 가중 블렌드** — 예측 bias = `minor.bias·0.35 + primary.bias·0.65`.
- **대형 추출: 적응형 스윙 임계 래더** — 전체 차트에서 큰 다리 ~6~9개를 목표로 민감도 자동 선택.
- **combine 기여도: 소형 유지·불변** (블렌드 수학 비건드림).

## 3. 데이터 모델 (`analyzeElliott` 반환 확장 — 하위호환)

기존 최상위 필드(`waves`/`structure`/`current`/`next`/`rules`)는 **그대로 소형 degree**를 의미한다(기존 소비자 회귀 0). 두 필드를 추가한다:

```js
analyzeElliott(price, opts) → {
  // ── 소형(minor) degree: 기존과 100% 동일 ──
  waves, structure, current, next, rules,
  // ── 추가 ──
  primary: { waves, structure, current, next, rules, bias } | null,  // 대형 degree
  bias    // 블렌드: primary 있으면 minor.bias*0.35 + primary.bias*0.65 (clamp[-1,1]),
          //         primary===null이면 minor.bias (현행과 동일)
}
```

- `minor.bias`는 내부적으로 계속 계산하되 최상위 `bias`는 위 블렌드 값으로 둔다(예측 드리프트가 최상위 `bias`만 읽으므로 호출부 불변).
- 분석 로직 공통화: 내부 헬퍼 `elliottDegree(swings, P)`가 `swings`(변곡점 배열)와 길이 `P`를 받아 `{ waves, structure, current, next, rules, bias }`를 산출한다(현재 `analyzeElliott` 본문의 legs→라벨→r1/r2/r3→structure→next→bias 로직을 그대로 이관). `analyzeElliott`는 minor 스윙과 primary 스윙 각각에 대해 `elliottDegree`를 호출한다.

## 4. 대형 스윙 추출 (적응형 래더 — 접근안 A)

내부 헬퍼 `primarySwings(price, minorSens)`:

```
LADDER = [0.30, 0.22, 0.16, 0.12, 0.09]   // 내림차순(큰 임계 먼저)
대상: detectSwings(price, s)가 내는 leg 수(=pivots-1)가 6~9 구간에 드는 첫 s.
없으면: 6~9 범위 중앙(7~8)에 leg 수가 가장 가까운 s를 채택(결정적).
반환: { swings, sens } 또는 null.
```

- **안전장치**: 채택한 `sens`가 `minorSens` 이하이면(짧거나 저변동 차트라 소형=대형으로 수렴) `null` 반환 → 대형 작도·블렌드·배지 모두 생략, 소형만 동작.
- 결정적(no RNG). `detectSwings`를 그대로 재사용(신규 스윙 알고리즘 없음).
- leg 수 6~9 = 임펄스 5파 + 조정 ABC 시작을 라벨링하기에 충분한 범위(라벨 배열 `["1".."5","A","B","C"]` 8개와 정합).

## 5. 예측 결합 (run 드리프트)

- `forge-core.js run()`의 `ewDrift = _ew.bias * _prof.trendScale * 0.08` — **공식·상한(±8%)·TF가중 전부 불변**. 입력 `_ew.bias`는 이제 §3의 블렌드 값(대형 가중 0.65) → 큰그림 방향이 예측에 반영되되 **이중계상 없음**(단일 드리프트항).
- `primary===null`이면 `bias===minor.bias`로 현행과 완전히 동일(회귀 0).

## 6. Hero 작도 (`forge.html` `_drawElliottLayers` — 두 degree)

`_drawElliottLayers(c, ea, M)`가 `ea.primary`가 있으면 대형을 먼저(뒤에) 깔고 소형을 위에 그린다.

- **소형(minor)**: 현행 그대로 — 색 `#c47ae0`, 선 1.8px, 평문 라벨 `1 2 3 4 5 / A B C`, 변곡점 점 2.6px, 다음 파동 투영선(점선).
- **대형(primary)**: 같은 hue, **선 2.8px·`globalAlpha 0.85`**, 변곡점 점 3.4px, 라벨은 트레이딩뷰식 **괄호 표기 `(1)(2)(3)(4)(5)` / `(A)(B)(C)`**. 대형도 `next` 투영선을 (있으면) 더 굵은 점선으로.
- 두 degree 모두 변곡점 좌표는 `fiToX(Math.max(fiMin, idx))`로 매핑 → 데이터-윈도 줌 시 화면 밖 변곡점은 비유한값이 되어 기존 `isFinite` 가드로 자동 클립(현 패턴 유지).
- **구조 배지**: 우상단 슬롯에 대형 구조 배지 1줄 추가(`대 임펄스↑ 3/3 유효0.88` 형식), 소형 배지와 별도 `badgeY` 슬롯. 색은 구조별(임펄스=`#c47ae0`, 조정=`#e8b463`, 불확실=`#8a92b2`).
- `reveal` 게이트(재생 애니메이션)는 현행 레이어 단계와 동일하게 적용(대형 폴리라인=layer1, 배지=layer2, 투영=layer3).

## 7. 노드 배지 + 결합 기여도 (범위 명확화)

- **노드 배지**: 엘리어트 노드의 스캔 배지(`paintScanBadges`)와 미니 메타(`miniMeta`의 `case "elliott"`)를 **두 degree 동시** 표기로 확장 — 예: `대(III)↑ · 소(5)▲`(대형 구조의 현재 파동 + 소형 현재 파동/방향). 대형 구조가 로마자 라벨이면 그대로, 없으면 방향 화살표만.
  - 노출 경로: `elliottAnalyze`(결합 평가에서 호출되어 `meta[id]` 생성)가 `meta.primary = { current, structure }`를 추가로 반환. `elliottAnalyze`도 §4 `primarySwings`를 사용해 대형 `current/structure`만 계산(작도용 전체 분석은 hero의 `analyzeElliott` 경로가 담당, 중복 최소화).
- **결합(combine) 기여도**: `elliottAnalyze.values`(인덱스별 ±0.7, 소형 legs 위) — **변경 없음**. combine 블렌드 입력이므로 보수적으로 소형 유지(과거 volume magnitude 오염류 회귀 방지). 큰그림은 *예측 드리프트*·*배지*·*작도*로만 반영.

## 8. `elliottSteps` (시연 텍스트)

대형 정보를 1줄 추가: `"대형 " + primary.structure_kr + " · 소형 " + minor.current.label + "파"` 형태로 큰그림/세부를 함께 노출(분석 재생 시 표시). `primary===null`이면 추가 줄 생략(현행 5줄 유지).

## 9. 테스트 (node `forge-core.test.js`, 현재 83/0)

- `primarySwings`: ① 짧은 시계열(예: 30봉, 단순 추세)→`null`, ② 긴 합성 다중파(5-3 임펄스를 큰 진폭으로 합성한 ≥300봉)→leg 수 6~9, `sens > minorSens`.
- `analyzeElliott`: ① minor 최상위 필드가 기존 케이스와 동일(회귀 스냅샷), ② `primary` 구조 정확(up-first 합성→`impulse_up`, down-first→`impulse_down`), ③ 최상위 `bias` 블렌드 산식 검증(`minor.bias*0.35+primary.bias*0.65` clamp), ④ `primary===null`인 짧은 시계열에서 `bias===minor.bias`.
- `elliottAnalyze`: `meta.primary.current` 노출(대형 구조 있는 합성 시계열) / 짧은 시계열에서 `meta.primary` 없거나 null. `values`는 기존과 동일(회귀).
- 회귀: 기존 82 테스트 불변(특히 결합/예측 기존 케이스). `node --test` 전체 그린.

## 10. 영향 / 호환 / 비목표

- **코어 단일출처 패턴 유지**: `elliottDegree` 공통 헬퍼 + `primarySwings`만 신규, `detectSwings` 재사용. 신규 스윙 알고리즘·RNG 없음.
- **회귀 0 경로**: `primary===null`이면 분석·예측·작도·배지 전부 현행과 동일. primary 존재 시에도 combine 기여도·소형 작도는 불변.
- **비목표(YAGNI)**: 3단계+ degree, 재귀 중첩 서브분할(접근안 C), combine 기여도 변경, 대형 degree 전용 파라미터 UI, 대형 전용 색상 토큰 신설.
- 단일 HTML(+코어 JS)·바닐라·무빌드·다크 토큰·한국어 라벨·noindex 유지. 배포 대상은 `forge.html`+`forge-core.js`(불가침 JSON·키 파일 제외).

## 11. 검증

- node `forge-core.test.js` 전체 그린(신규 다중 degree 케이스 포함).
- 헤드리스/라이브: (a) 긴 차트(예: AAPL 5000봉, BTC-USD)에서 대형 파동이 차트 전체를 가로질러 작도되고 소형이 최근에 겹쳐 보임, (b) 괄호 라벨 `(1)..(5)`·대형 구조 배지 표시, (c) 예측 콘 방향이 대형 큰그림을 반영(블렌드), (d) 짧은/저변동 차트에서 대형 생략(회귀 0), (e) 데이터-윈도 줌 시 화면 밖 대형 변곡점 클립 정상, (f) 노드 배지 `대·소` 동시 표기.
