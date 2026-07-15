# 설계: 차트 기하·패턴 자동작도 지표 추가 (Gann 각도 + 패턴 감지)

> 대상: `map/forge.html`·`map/forge-state.js`·`map/forge-ui.js`·`map/forge-draw.js`·`map/forge-app.js`(프론트·작도) + `map/forge-core.js`(엔진·탐지) + `map/forge-core.test.js`(단위테스트). 배포: git + cafe24 `www/map/`.
> 작성: 2026-07-15. 브레인스토밍 합의 기반.

## 배경 / 요구

- 사용자 요청: forge에 추가할 작도/지표 후보 — **Gann 각도·헤드앤숄더·bull/bear flag·추세선/빗각 작도**.
- 성격 선택: **1번 = 자동 분석 지표(엔진 융합)**. 사이트 원칙("모든 것을 자동작도")과 정합.
- 사용자 핵심 우려: **기존 분석엔진·백테스트(회고 포함) 검증자산을 잘못 건드릴까 두려움**. → 본 설계의 최우선 제약은 **"기존 검증자산 무수정 · 순수 추가(additive)"**.
- 사용자 통찰(설계 축): 세 후보는 **성격이 두 범주로 갈린다.**
  - **범주 A — 연속 지표(main indicator)**: 상시 값을 내는 지표. → **Gann 각도**.
  - **범주 B — 패턴 감지기(pattern checker)**: 모양이 "있냐/없냐"의 occurrence 기반. → **헤드앤숄더·flag**.
- 기존 상태: `trend`(다각도 추세선·R²·미래투영)는 이미 존재 → 사용자가 든 "추세선"은 커버됨. 신규는 **Gann·H&S·flag**.

## 핵심 원칙 (불가침 제약)

1. **순수 추가**: 신규 지표는 각각 `_drifts` 배열에 **드리프트 항 1개**만 추가. 기존 30종 지표 로직·`run()` 융합 수식·회고 인프라(`map/backtest/`, `map/backtest/retro/`)를 **한 줄도 수정하지 않는다.**
2. **±0.28 총캡 = 안전망**: 전 지표 드리프트 합은 이미 `±0.28`로 캡. 신규 지표 cap은 관례대로 **보수적(≤ .08)**. 패턴 탐지가 틀려도 예측을 지배 불가.
3. **기본전략 미편입**: 신규 블록은 `seedDefaultStrategy`에 **넣지 않는다** → 3패널 레일 선택형 → 사용자가 노드로 꺼내 놓기 전엔 영향 0 → **백테스트/회고 베이스라인 문자 그대로 불변**.
4. **테스트 추가만**: `forge-core.test.js`(현 199케이스)에 신규 케이스 **추가**. 기존 케이스 **수정 금지**, 전부 그린 유지.
5. **공용 primitive 재사용**: 스윙/피봇 탐지는 이미 검증된 `detectSwings(arr, sens, opts)`(structure·fib·elliott·pivot 공용) + `primarySwings(price, minorSens)` + `_domSwing(price, s0)`을 재사용. 바퀴 재발명 금지.
6. **승격은 나중·별도 결정**: 기본전략 편입 또는 백테스트 축 등록(=검증자산 영향)은 **엣지가 실측된 뒤에만** 별도로 결정한다([[scoopforge-open-engine-principle]] 열린 엔진 원칙, [[scoopforge-backlog-workflow]]).

---

## 설계 A — Gann 각도 (blockType: `gann`, 범주 A)

기존 `fib`·`pivot`과 같은 계보의 **연속 오버레이 지표**(기준점 앵커 + S/R 팬 + 미래 투영).

### A-1. 앵커 자동 선택
- `primarySwings`/`_domSwing`으로 **최근 지배 스윙**을 자동 선택(사용자 개입 없음 — 자동작도 원칙).
- **상승 전환(직전 지배 스윙저)** → 상방 팬(각도선이 앵커에서 우상향).
- **하락 전환(직전 지배 스윙고)** → 하방 팬(우하향).
- 앵커 없음(스윙 부족) → 지표 침묵(bias 0, 작도 없음).

### A-2. 각도 세트 + 스케일 정규화 (주요 설계 결정점)
- 각도 세트: **1×1(기준)·2×1·3×1·4×1·1×2·1×3·1×4** 부채꼴.
- 문제: Gann 각도는 원래 가격×시간 격자에 의존(스케일 종속 → 차트마다 "45°"가 달라짐).
- **해결 = ATR 정규화**: `1×1` 각도의 봉당 가격 증분 = **1 ATR/봉**(기존 `analyzeAtr`의 ATR 재사용). `2×1` = 2 ATR/봉, `1×2` = 0.5 ATR/봉 … → **차트·종목 무관, 변동성 기준의 의미 있는 각도**.
- `N×1` = 가파른 각(빠른 상승 기대), `1×N` = 완만한 각(느린 상승).

### A-3. bias 산출 (`analyzeGann(data, opts) → { bias, anchor, angles, ... }`)
- 순수 함수, `bias ∈ [−1, 1]`.
- 상방 팬 기준: 현재가가 **1×1 위 = 강세**, 아래 = 약세. **2×1·3×1 상단각 위 = 강세 가속**(bias↑), 완만각(1×2·1×3) 아래로 이탈 = 약세.
- 하방 팬은 부호 반전.
- 최종 드리프트: `run()`에서 `bias × trendProfileForTF(tf).trendScale × capGann(≤ .08)` → `_drifts` 1개 항. (드리프트 이중계상 금지 — 오버레이는 combine `zeros`, 방향은 이 드리프트로만.)

### A-4. 보조 산출물
- `gannSteps()`: 시연 서술(analysisSteps·nodeExpert용) — "앵커 = 직전 지배 스윙저 {가격} / 현재가는 1×1 각 위 → 상방 지지 유효" 형태.
- combine 기여: 오버레이 성격 → `gannSeries`는 `zeros`(pivot 선례). 방향은 드리프트로만.

### A-5. 작도 (`fcDrawGann` 또는 `_drawGannLayers`)
- 앵커점에서 미래 구간(seamX~plotRight)으로 **부채꼴 팬 라인** 렌더. `_mainGeo`의 `toXf(k)`/`toY(v)`.
- 1×1은 강조(굵게·골드 계열), 나머지 각은 흐리게. 각선 끝점 라벨 옵션(`"1×1 ≈ {가격}"`).
- 포커스(`_focusInd === 'gann'`) 시 강조 글로우 + 현재가가 걸친 각 하이라이트.
- **좌측 세로 accent line 절대 금지**([[no-left-accent-line]]).

---

## 설계 B — 패턴 감지 (blockType: `pattern`, 범주 B, 단일 블록)

occurrence 기반 단일 블록. 내부 **패턴 라이브러리**를 스캔 → 감지 시에만 작도+bias, 미감지 시 침묵.

### B-1. v1 패턴 라이브러리
- **헤드앤숄더(H&S)** — 하락 반전.
- **역헤드앤숄더(inverse H&S)** — 상승 반전.
- **bull flag** — 상승 지속.
- **bear flag** — 하락 지속.
- 확장 여지(문서화, v1 제외 — YAGNI): 이중천장/바닥·삼각수렴·쐐기·컵&핸들. `detectSwings`로 저렴하나 v1은 위 4종에 집중.

### B-2. 탐지 (`detectPatterns(price, opts) → { pattern, dir, confidence, geom }|null`)
- 공용 `detectSwings` 출력(교대 스윙 시퀀스) 위에서 기하 매칭:
  - **H&S / 역H&S**: 최근 5개 교대 스윙 = 어깨-머리-어깨 구조(가운데 극점이 양옆보다 우월) + 두 어깨 사이 **넥라인**(swing 반대극 2점 연결). 대칭도·넥라인 기울기로 신뢰도.
  - **flag**: 급등/급락 **폴(pole)** + 뒤이은 **역방향 소폭 조정 채널**(평행 추세선 2개, 낮은 변동성). 폴 크기·채널 기울기로 신뢰도.
- `confidence ∈ [0,1]` 스코어. 임계 미달 → `null`(미감지).
- 성능: `_anGet`(프레임 메모이즈) 경유. 프레임마다 재탐지 금지.

### B-3. occurrence bias (`analyzePattern → { bias, detected, ... }`)
- **미감지** → `bias 0`, `detected: null`, **작도 없음**.
- **감지 + 넥라인/채널 미돌파** → 약한 bias(예정 방향 × confidence × 0.5).
- **감지 + 돌파 확정** → 강한 bias(예정 방향 × confidence). 여전히 `run()`에서 cap ≤ .08.
- H&S/bear flag = 음(−) 방향, 역H&S/bull flag = 양(+) 방향.

### B-4. 작도 + 2패널 판정
- 감지 시 4패널에 **모양 자동작도**: H&S = 어깨·머리 마커 + 넥라인, flag = 폴 + 평행 채널.
- **2패널(지표신호 판정)** 행: `감지된 패턴: 헤드앤숄더(하락 반전) · 신뢰도 72%`. 미감지: `감지된 패턴 없음`.
- `patternSteps()`: 시연 서술.

---

## 엔진 통합 체크리스트 (지표당 통합 패턴 — 각 신규 지표 반복)

`forge-core.js`:
- [ ] `analyzeGann` / `detectPatterns`+`analyzePattern`(순수, bias∈[−1,1]).
- [ ] combine용 series(`gannSeries`=zeros / `patternSeries`=감지 시 상수, 미감지 0) — 방향은 드리프트로.
- [ ] `gannSteps` / `patternSteps`(시연 서술).
- [ ] `evalBlocks` 케이스 추가.
- [ ] `run()` 단일 드리프트 항: `bias × trendProfileForTF(tf).trendScale × cap(≤.08)` → `_drifts`.
- [ ] ATR 재사용(gann), `detectSwings`/`primarySwings` 재사용(양쪽).

`forge.html` + 분할 UI 파일(state/ui/draw/app) 16지점:
- [ ] `BLOCK_DEFS`(정의·기본 파라미터) · `IND_TIERS`(등급 배치) · `NEW_INDICATORS`(레일 'new' 배지).
- [ ] `GAUGE_TYPES` · `_an` 프레임캐시 래퍼 · `_nodeBias` · `EV_COLORS`/`LABEL` · `TUNE_TYPES` · `INDICATOR_INFO`(30→32종 도구 안내).
- [ ] hero 작도 dispatch(`fcDrawGann`/패턴 작도) · `playAnalysis` indNodes · `renderParams`(파라미터 있으면).
- [ ] `seedDefaultStrategy` = **편입 안 함**(원칙 3).

`forge-core.test.js`:
- [ ] Gann: 합성 상방/하방 데이터로 앵커 선택·각 위/아래 bias 부호 검증.
- [ ] 패턴: 합성 H&S/역H&S/flag 모양 → 감지 True + 방향, 무패턴 노이즈 → 감지 False.
- [ ] 기존 199 그린 유지.

## IND_TIERS 배치

- `gann` → **Lv2(주요 지표)** 또는 Lv3(보조·전문). fib·pivot과 동류이므로 **Lv2** 제안.
- `pattern` → **Lv4(고급·심화)**(elliott·smc·structure와 같은 구조/패턴 계열). `NEW_INDICATORS`에 둘 다 등록(레일 'new' 배지).

## 검증

- `node map/forge-core.test.js` — 신규 포함 전부 그린.
- 헤드리스 시각검증([[headless-verify-wsl]]): Gann 팬 자동작도·패턴 감지 시 모양+2패널 판정 렌더 확인. **라이브 실데이터 쓰기함수 금지**([[headless-live-tests-readonly]]).
- 백테스트 베이스라인: 신규 블록 기본전략 미편입 → 스코어카드 수치 불변 확인(회귀 없음).
- 성능: 포커스/미감지 시 재탐지 없음(`_anGet` 메모이즈).

## 순서 (스펙 → 구현)

1. **Gann 각도** 먼저 구현 → 16지점 통합 패턴으로 "안전 추가 루프" 증명(테스트·헤드리스·백테스트 불변 확인).
2. 이어서 **패턴 감지 블록**.
- 각 단계 완료 시 커밋 + cafe24 배포([[commit-deploy-as-one-set]], [[scoopforge-deploy]]). `forge-core.test.js` 배포 제외, 서버 데이터 파일 불가침.

## 열린 항목 / 향후

- **승격 결정**: 실사용/실측에서 엣지가 보이면 기본전략 편입·백테스트 축 등록을 별도 브레인스토밍으로.
- 패턴 라이브러리 확장(이중천장/바닥·삼각수렴·쐐기·컵&핸들).
- Gann: 시간 사이클(Gann 시간축) 확장은 v1 제외.
