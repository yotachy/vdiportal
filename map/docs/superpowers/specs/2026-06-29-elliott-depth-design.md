# 엘리어트 파동 심화 (Elliott Wave Depth) — 설계

- 작성일: 2026-06-29
- 대상: 스쿱포지(Scoop Forge) — `forge.html` + `forge-core.js`
- 선행: 추세선·MA·피보 심화 + 시연 상세화 프레임워크(Plan B) 구현·배포됨.
- 상태: 설계 승인됨 (구현 계획 대기)
- 위치: 도구 심화 로드맵 **3번(엘리어트)**. 추세선·MA·피보 패턴(단일출처·TF가중·다레이어 reveal 작도·시연 단계) 재사용.

## 1. 배경 / 문제

현재 엘리어트(`elliott`)는 얕다:
- eval: `elliottAnalyze(arr, sens)` — detectSwings 레그를 **최근 8개만 1·2·3·4·5·A·B·C로 단순 순번 라벨**. 규칙 검증·추진/조정 구분·투영 없음.
- 작도: 피벗 zigzag 폴리라인 + 글자 라벨(`_EWLAB`).
- 신호: `cl(current.dir)`(현재 파동 방향).
- 시연: `nodeReadText` "파동 N ▲/▼" 한 줄.

문제: 단순 순번 라벨이라 **엘리어트 규칙(고전 3규칙)을 검증하지 않고**, 임펄스/조정 구분·다음 파동 투영·유효도가 없으며, 예측 반영이 약하고 시연이 한 줄이다.

## 2. 목표

전문가급 엘리어트 분석으로 심화하고 예측·작도·시연에 일관 반영한다. 시연은 Plan B 프레임워크에 엘리어트 케이스만 추가해 재사용. **실용적 휴리스틱**(detectSwings 레그 위 규칙 점검)으로 구현하고, 다중 등급(degree) 완전 EW 엔진은 만들지 않는다(YAGNI).

### 비목표 (YAGNI)
- 다중 파동 등급(sub-wave) 재귀 카운트·대안 카운트 열거.
- 엘리어트+다른 지표 합류.

## 3. 아키텍처

엘리어트 분석을 코어 순수 함수 `analyzeElliott`로 모아 예측(`run`)·작도(`_drawElliottLayers`)가 공유. 시연 텍스트는 코어 `elliottSteps`로 분리(테스트 가능). 기존 `elliottAnalyze`(블록 값 시계열)는 **유지**(combine→signal 경로 불변) — 피보가 `fibPos` 유지하고 `analyzeFib` 추가한 것과 동일.

## 4. 코어: `ForgeCore.analyzeElliott(price, opts)` (신규 순수 함수)

```js
analyzeElliott(price, { swing=0.03 }) → {
  waves: [{ idx, price, label }],            // 최근 파동 카운트(최대 8: 1·2·3·4·5·A·B·C)
  rules: { r1:boolean, r2:boolean, r3:boolean, score:number },  // score 0..1
  structure: "impulse_up" | "impulse_down" | "corrective" | "uncertain",
  current: { label:string, dir:number },     // 현재 파동 라벨·방향(+1/-1/0)
  next: { label:string, target:number, dir:number } | null,    // 다음 기대 파동 + 피보 투영 목표가
  bias: number,                               // -1..1
}
```

### 4.1 파동 카운트
- `detectSwings(price, swing)` → 레그(연속 피벗쌍). 최근 8개 레그를 `["1","2","3","4","5","A","B","C"]` 라벨(현 `elliottAnalyze`와 동일 기반). 각 wave는 레그 종점 `{idx, price, label}`.
- 피벗 2개 미만 → 폴백: `waves:[]`, `structure:"uncertain"`, `bias:0`, `next:null`.

### 4.2 규칙 검증 (고전 3규칙, 1~5파 후보가 있을 때)
1~5파에 해당하는 5개 레그가 있을 때(상승 임펄스 가정: 1·3·5 up, 2·4 down — 하락은 대칭):
- **R1**: 2파 되돌림이 1파의 100% 이하 (2파 끝이 1파 시작을 넘지 않음).
- **R2**: 3파가 1·3·5 중 최단이 아님(길이 비교).
- **R3**: 4파가 1파 가격 영역을 침범하지 않음(상승: 4파 저점 > 1파 고점).
- `score = (통과 규칙 수)/3` × (5파 완성도 가중: 5개 레그 있으면 1.0, 적으면 비례). 5파 미만이면 진행 중으로 보고 가능한 규칙만 점검.

### 4.3 추진/조정 분류
- 5파 임펄스 패턴(방향 일치 + R1~R3 다수 통과) → `impulse_up`/`impulse_down`(1파 방향).
- 3파(ABC) 조정 패턴 또는 5파 후 되돌림 → `corrective`.
- 그 외 → `uncertain`.

### 4.4 다음 파동 투영 (피보 비율)
- 현재 파동 위치별 다음 파동 목표(피보):
  - 2파 끝 → 3파 목표 = 1파 시작 + 1.618 × |1파 span| (방향).
  - 4파 끝 → 5파 목표 = 4파 끝 + 1.0 × |1파 span| (또는 0.618 × |1~3파|).
  - 5파 끝 → A파(조정) 목표 = 5파 끝 − 0.5 × |1~5파 span| (방향 반대).
- 위 세 경우(2파끝→3파, 4파끝→5파, 5파끝→A) 외(ABC 진행 중 등)에는 `next = null`(투영 생략) — 결정적·단순 유지.
- `next = { label, target, dir }`. 투영 불가·데이터 부족이면 `null`.

### 4.5 bias
- `dirBase`: impulse_up=+1, impulse_down=−1, corrective=현재 진행방향의 반대로 약화(±0.4), uncertain=0.
- `bias = clamp(-1, 1, dirBase × (0.4 + 0.6 × score))` — 유효도 낮으면 기여 감쇄.

## 5. 예측 연동: `forge-core.js` `run`

- `run`에서 엘리어트 블록이 있으면 `analyzeElliott(price, {swing})`로 `bias` 산출.
- `ewDrift = bias × trendProfileForTF(opts.timeframe).trendScale × 0.08` (±8% 상한·TF가중·유효도는 bias에 이미 반영). 예측 루프 `m`에 `+ ewDrift × (k/futW)` 가산(단일경로·이중계상 방지). 엘리어트 블록 없으면 0.
- swing 파라미터: 정수%→`/100` (기존 elliott `swing` 규약과 동일 — `((_en.params&&_en.params.swing)!=null?_en.params.swing:3)/100`).

## 6. 작도: `forge.html` `_drawElliottLayers(c, ea, M)` (차트·오버레이, reveal 인지)

- `M = {fiToX, pToY, nowFi, fiMin, reveal, xRight}` — 기존 helper 규약. `c.save()/restore()`.
- 레이어(reveal 게이트):
  1. **파동 폴리라인 + 라벨**(reveal≥1): 피벗 잇는 선 + `_evLabel`로 파동 글자(경계 클램프). 규칙 위반 파동 라벨은 경고색(bear).
  2. **유효도/구조 배지**(reveal≥2): 우상단 `_evLabel`로 "임펄스 5파 ✓ 유효 0.80" / "ABC 조정" / "불확실" 표기.
  3. **다음 파동 투영**(reveal≥3): 마지막 피벗→`next.target` 점선 + "→ N목표 가격" 라벨(xRight까지 연장 가능).
- 기존 zigzag+라벨 elliott 분기(차트·오버레이 2곳)를 `analyzeElliott`+`_drawElliottLayers`로 교체. `reveal: _playing ? (_evReveal[n.id]||0) : Infinity`. 범례 "엘리어트"→"엘리어트(전문)".

## 7. 시연 (Plan B 프레임워크 재사용)

- 코어 `elliottSteps(ea) → string[5]`(테스트 가능): 스윙/파동 카운트 / 규칙 검증·유효도 / 추진·조정 분류 / 다음 파동 투영(목표) / 종합 방향(bias).
- `analysisSteps` 엘리어트 케이스: `n.blockType==="elliott"` → `ForgeCore.analyzeElliott(price,{swing/100})` → `elliottSteps`, layers `[1,1,2,3,4]`. (그 외 폴백 유지)

## 8. 테스트 (`forge-core.test.js`)

- `analyzeElliott`:
  - 명확한 5파 상승 임펄스 합성 → `structure:"impulse_up"`, `rules.score>0`, `next` 투영 존재, `bias>0`.
  - 하락 임펄스 → `impulse_down`, `bias<0`.
  - ABC 조정형 → `structure:"corrective"`.
  - 소량/피벗부족 → 폴백(`uncertain`, bias 0, next null, 예외 없음).
- `elliottSteps`: 5단계 텍스트, 구조·유효도·bias 반영.
- 예측: 엘리어트 블록 + 임펄스 데이터에서 `timeframe:"월봉"`이 `"5분"`보다 상향(TF 가중); 엘리어트 유무로 타깃 격리(notStrictEqual); 둘 다 유한.

> 합성 데이터가 detectSwings/규칙과 어긋나 structure가 기대와 다르면 **테스트 데이터만** 조정(단언·로직 불변).

## 9. 영향 / 호환

- 엘리어트 블록 `params.swing` 기존 유지. `analyzeElliott`·`elliottSteps` 순수/결정적 → 테스트 용이. export 추가.
- 기존 `elliottAnalyze`(블록 값) 불변 → combine 경로 회귀 없음.
- 시연 프레임워크 재사용 — `analysisSteps` 케이스 + `_drawElliottLayers` reveal만 추가.
- 단일 HTML·바닐라 JS·무빌드·다크 토큰·한국어·작도/예측 정합·noindex 유지.
