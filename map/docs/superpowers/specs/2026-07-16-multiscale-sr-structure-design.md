# 다중스케일 위계 작도 확장 — S/R · structure (작도 전용)

- 날짜: 2026-07-16
- 상태: 설계 승인됨 (구현 대기)
- 배경 메모리: [[scoopforge-multiscale-drawing]] · 선례 커밋: Gann 다중앵커 `a1d8354..1999d9c`
- 백로그: `docs/BACKLOG.md` 항목 0 **[확장]**

## 1. 배경 / 목표

Gann 각도팬은 `collectAnchors`(고정 창 금지·민감도 사다리·중요도 스코어)로 **데이터 기반 다중스케일 + 중요도 위계(강조/디밍)**를 이미 구현했다. 같은 "애널리스트 뷰"를 **S/R(피벗 노드)**와 **structure(시장구조 노드)** 작도로 확장한다.

현재 상태:
- **S/R (`_drawPivotLayers`)**: 고전 피벗포인트(직전 기간 HLC → P·R1~3·S1~3) 단일 산출. 스윙 기반·다중스케일 아님. **가장 고정적**.
- **structure (`_drawStructureLayers`)**: 최근 swingHigh/Low + BOS/CHoCH 한 건. 다중스케일 아님.

목표: 두 작도를 **여러 스케일의 유의미한 스윙을 넉넉히 발굴 → 중요도 순위 → 강조/디밍**으로 전환한다.

## 2. 핵심 제약 (불변 규율)

- **엔진 bias/예측 완전 불변**. 새 계산은 전부 `opts.draw` 게이팅으로 **작도 전용**. `analyzeX`가 반환하는 bias 필드·`run()`·`evalBlocks` 경로는 손대지 않는다. baseline(백테스트) 안전.
- **비용 격리 (Gann 교훈 `0927ca4`)**: 드로 계산은 draw 호출에서만 실행. bias/게이지 표시 경로(`_nodeBias`)는 `draw` 없이 호출되어 비용 0.
- **좌측 컬러 라인 금지** ([[no-left-accent-line]]): 강조는 배경색·텍스트색·굵기·라벨로만. accent bar/rail 금지.
- **창밖 무음 방지**: 가시 윈도우 밖 요소가 조용히 사라지지 않게 처리(수평선은 전폭, 스윙 점은 가장자리 마커/클램프).
- **reveal 게이팅**: 시뮬레이션 재생 중 형제 지표와 노출 타이밍 정합(Gann `_evReveal` 패턴).

## 3. 비목표 (YAGNI)

- 추세선·fib 작도는 **이번 범위 아님**(이미 장/중/단 다중 + 강조/디밍 보유). 후속 배치로.
- 엔진 bias를 다중스케일 구조로 바꾸는 것(별도 큰 과제 — 백테스트·자명규칙·OOS 검증 동반, 메모리에 "나중에" 명시).
- 고전 피벗 R/S1~3의 계산 제거(엔진 bias가 사용 — **데이터는 존속**, 작도만 생략).

## 4. 아키텍처

### 4.1 코어 (forge-core.js · UMD · 단위테스트)

작도 전용 순수 함수 2종 추가. `collectAnchors`와 같은 `LADDER` 기본값(`[0.18, 0.12, 0.08, 0.05, 0.035, 0.02]`)·`detectSwings` 재사용.

#### `collectLevels(price, opts)` → S/R 수평 레벨 클러스터

```
입력:  price: number[]  (P<24 → [])
       opts: { ladder?, clusterPct?, minTouches?, cap? }
동작:
  1) 각 LADDER 민감도로 detectSwings → 스윙 피벗 수집 {idx, price, type:"H"|"L", degree:li}
  2) 가격 근접 클러스터링: |a.price - b.price| <= clusterPct * range (기본 clusterPct=0.006)
     → 같은 클러스터로 병합. 클러스터 대표가 = 기여 피벗 가격 가중평균(degree 가중)
  3) 각 레벨 스코어:
       touches  = 기여 피벗 수 (스케일 넘나드는 중복은 근접 병합 후 카운트)
       degMin   = 최강(최소) degree → degW = 1 - degMin/LADDER.length
       recency  = max(기여 toIdx)/lastIdx
       prox     = 1 - min(1, |levelPrice - last|/range)
       side     = levelPrice <= last ? "support" : "resistance"
       significance = clamp01( 0.35*min(1,(touches-1)/3) + 0.30*degW + 0.20*prox + 0.15*recency )
반환:  [{ price, side, touches, degMin, significance, reason }] significance 내림차순
       (minTouches 미만·cap 초과 필터는 반환 시 적용, 기본 cap=10)
```

`reason`(강조 라벨 후속 부착용): 예 `"3회 터치 · 현재가 근접"`.

#### `collectStructure(price, opts)` → 다중스케일 구조 티어

```
입력:  price: number[]  (P<24 → { tiers: [] })
       opts: { tiers?, ... }  (기본 3티어 = LADDER의 [0.12, 0.06, 0.03] 근처 부분집합)
동작:  각 티어 degree에 대해:
  1) detectSwings(price, sens) → 스윙 시퀀스 [{idx, price, type:"H"|"L"}]
  2) 라벨링: 직전 동종(H끼리/L끼리) 피벗 비교
       H: 이전 H보다 높으면 "HH", 낮으면 "LH"
       L: 이전 L보다 높으면 "HL", 낮으면 "LL"
  3) 이벤트 판정(티어별): 마지막 스윙이 직전 반대 극점을 추세방향으로 돌파 → BOS
       추세 반대로 돌파(직전 구조 방향과 반대) → CHoCH
  4) significance: 티어 degW + 최근 스윙 recency + 스윙 폭
반환:  { tiers: [{ degree, sens, swings:[{idx, price, type, label, significance}],
                   event:"BOS_up"|"BOS_down"|"CHoCH_up"|"CHoCH_down"|"none",
                   eventPrice, significance }] }  significance 내림차순(대형 먼저)
```

#### 통합 지점 (코어)

- `analyzePivot(data, opts)`: `if (opts && opts.draw) result.srLevels = collectLevels(price, opts)`. 기존 P/R/S·bias 필드 그대로.
- `analyzeStructure(price, opts)`: `if (opts && opts.draw) result.tiers = collectStructure(price, opts).tiers`. 기존 swingHigh/Low·event·swings·bias 그대로.
- `module.exports` / `window.ForgeCore`에 `collectLevels`·`collectStructure` 추가(export 목록).

### 4.2 드로 래퍼 (forge-ui.js) — 비용 격리

확인 결과 `_nodeBias`가 `case "pivot": return _anPivot(P).bias`로 **`_anPivot`을 bias에 사용** / `case "structure"`는 제네릭 `_an("Structure", …)`(무draw). 따라서 draw 비용을 bias에 얹지 않으려면 **드로 전용 래퍼를 별도 캐시키로 신설**한다(Gann `_anGann` 미러).

- `_anPivot(P)`: **변경 없음**(캐시키 "Pivot"·무draw) — bias/게이지 경로 유지.
- `_anPivotDraw(P)` **신설**: `analyzePivot({candle, price:P}, { draw:true })`, 캐시키 `"PivotDraw"`. 드로 디스패치(현재 `_anPivot(price)` 자리, forge-draw.js:2727)에서 이 래퍼로 교체.
- `_anStruct(P, opts)` **신설**: `analyzeStructure(P, Object.assign({}, o, { draw:true }))`, 캐시키 `"StructDraw|"+JSON.stringify(o)`. 드로 디스패치(현재 `_an("Structure", …)` 자리, forge-draw.js:2694)에서 이 래퍼로 교체. bias/게이지 경로는 기존 `_an("Structure", …)`(무draw) 유지 → 비용 0.

### 4.3 S/R 작도 (`_drawPivotLayers`)

- `piv.srLevels` 소비:
  - 정렬 후 상위 K개(기본 K=3) `emph=true`, 최상위는 항상 강조(Gann `_topAn` 패턴).
  - 강조 선: side색(지지 `#46c28e` / 저항 `#e06a6a`) 굵게(`CW.bold`)·alpha 0.9·라벨 `"저항 ×3 " + fmtNum(price)`.
  - 디밍 선: 헤어라인·alpha = `max(0.12, 0.15 + significance*0.4)`·라벨 생략.
  - 화면 밖(top/bot 범위 밖): 기존 가장자리 ▲/▼ 마커 재사용.
- 고전 피벗 **P만** 흐린 점선(참고, alpha≈0.35)·라벨 축약. R/S1~3 렌더 제거.
- reveal 게이팅: `reveal>=1` 강조 레벨 + P, `reveal>=2` 디밍 레벨(형제 지표 정합).

### 4.4 structure 작도 (`_drawStructureLayers`)

- `st.tiers` 소비(대형→소형):
  - 대형(tiers[0]): 스윙 점 굵게 + **HH/HL/LH/LL 라벨**(유의도 높은 스윙만) + BOS/CHoCH 강조 라벨.
  - 중형: 흐린 점·라벨 생략.
  - 소형: 잔점(작은 반경·저알파) 디밍.
  - degree별 색: 극점 종류(H=`#e06a6a`계·L=`#46c28e`계)에 alpha로 위계.
- 기존 단일 swingHigh/Low + event → 대형 티어로 흡수(중복 제거).
- reveal 게이팅: `reveal>=1` 대형 스윙·라벨, `reveal>=2` 중/소형 + 이벤트.
- 창밖 스윙: 좌단 클램프(선/점 진입점) 또는 skip 시 가장자리 마커.

## 5. 파일별 변경 요약

| 파일 | 변경 |
|---|---|
| `forge-core.js` | `collectLevels`·`collectStructure` 추가 · `analyzePivot`/`analyzeStructure` draw 분기 · export 2건 |
| `forge-ui.js` | `_anPivotDraw`·`_anStruct` 신설(드로 전용·별 캐시키). `_anPivot` 무변경 |
| `forge-draw.js` | `_drawPivotLayers`(srLevels 소비·P만) · `_drawStructureLayers`(tiers 소비) · pivot 디스패치가 `_anPivotDraw`, structure 디스패치가 `_anStruct` 사용 |
| `forge-core.test.js` | `collectLevels`·`collectStructure` 케이스 + draw 무 시 필드 부재·bias 스냅샷 회귀 |
| `forge.html` | `?v=` 캐시버스터 갱신(core·ui·draw) |

## 6. 테스트 전략

- **코어 단위테스트**(`node --test forge-core.test.js`):
  - `collectLevels`: 명확한 이중천장/바닥 시계열 → 해당 가격 레벨 검출·touches 카운트·side 분류·significance 단조(터치↑/근접↑ → 점수↑)·짧은 입력([])·결정성(동일 입력 동일 출력).
  - `collectStructure`: 상승 추세(HH/HL 시퀀스) → 라벨 정확·BOS 검출 / 반전 → CHoCH·티어 수·짧은 입력.
  - **회귀**: `analyzePivot(data)`(draw 없음)에 `srLevels` 부재 & 기존 bias 스냅샷 동일 / `analyzeStructure(price)`(draw 없음)에 `tiers` 부재 & bias 동일.
  - 현 199 케이스 유지 + 신규(목표 총계 증가).
- **시각 회귀**(헤드리스): 실 티커 플로우로 S/R·structure 노드 표시 → 강조/디밍 위계·라벨·창밖 마커 확인. reveal(시뮬레이션) 타이밍.
- **비용 확인**: `_nodeBias` pivot/structure 경로가 draw 계산을 트리거하지 않음(bias 캐시키 분리 검증).

## 7. 리스크 / 완화

- **클러스터 tol·스코어 가중치 튜닝**: 실차트에서 레벨이 과다/과소일 수 있음 → 기본값 보수적 설정 후 헤드리스 실측 튜닝(K·clusterPct·minTouches).
- **~~_anPivot 비용 회귀~~ (해결)**: `_nodeBias`가 `_anPivot`을 bias에 씀을 확인 → 드로는 별 캐시키 `_anPivotDraw`로 분리(§4.2). bias 경로 비용 0 확정.
- **structure 라벨 클러터**: HH/HL/LH/LL이 뭉칠 수 있음 → 유의도 임계 위 스윙만 라벨(Gann 라벨 정책 재사용).

## 8. 스코어카드

엔진 bias 불변이므로 백테스트 성적 변화 없음(작도 개선). 스코어카드 개선이력에 "다중스케일 작도 확장(S/R·structure) — 엔진 불변" 1줄 기록([[scoopforge-scorecard-changelog]] 규율).
