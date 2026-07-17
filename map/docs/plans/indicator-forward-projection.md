# 과제: 지표별 독립 해석 → 미래 투영 시각화 (Scoop Forge 웹분석 충실화)

> **중요 작업.** 세션이 끊겨도 이 문서를 기준으로 이어서 완료할 것.
> 대상 파일: `map/forge.html`(프론트/작도) · `map/forge-core.js`(엔진/투영 계산). 배포: git+cafe24 `www/map/`.

## 배경 / 요구
- 사용자: "각 도구의 분석이 **독립적인 해석**이 있어야 전체 분석으로 **융합**된다. 지금 로직이 그렇지 않다면 제대로 된 분석이 아니다(분석이 너무 빨랐던 이유)."
- 선택한 범례 지표가 **예측 기간(미래 구간)에서 어떻게 움직일지**를 그려, "이 지표가 이렇게 이어져서 예측가에 기여했다"는 직관을 준다.
- **성능/경량 유의**: 투영 작도는 **포커스(_focusInd) 시에만**, 계산은 `_anGet` 메모이즈. 프레임마다 재계산 금지.

## 핵심 원칙 (설계)
1. 각 지표는 **독립 forward-projection 함수**를 가진다: `project<Ind>(P, futBars, opts) → [{k, v}]`(월드 가격). futBars = `pred.path.length`.
2. 이 투영은 **엔진의 per-indicator drift와 정합**해야 한다(같은 방향/크기 감각). 엔진 run()의 `maDrift/trendDrift/icDrift`가 이미 융합에 들어감 → 투영은 그 해석을 "보이게" 하는 것.
3. 작도: `drawEvidence`에서 `_focusInd`가 해당 지표면, 미래 구간(seamX~plotRight)에 투영선/영역 + 끝점 라벨 `"이 지표 투영 ≈ {가격}"`.
4. 좌표: `_mainGeo`의 `toXf(k)`(미래 x), `toY(v)`(가격 y) 사용. #2에서 미래폭=캔들폭으로 이미 확장됨.

## 대상 지표 (순서)
- [x] **1. 추세선(trend)** — 이미 미래 투영(_drawTrendLayers, futBars/xRight) + 중기/단기/장기 +%/봉·R² 라벨. (parity: 도달 예상가 end-label 추가 예정)
- [x] **2. 이동평균(ma)** — 완료: 장기MA 봉당 기울기 damped 연장(exp decay), 포커스 시 점선 투영 + '이동평균 투영 ≈ {가격}' 라벨. drawEvidence서 xNow/xRight/futBars/focused 전달.
- [x] **3. 일목균형표(ichimoku)** — 이미 미래 구름 투영(_drawIchimokuLayers, futBars/shift). (parity: 도달 라벨 추가 예정)
- [x] **4. 볼린저·VWAP·슈퍼트렌드** — 완료(Phase 5b, `_projFwd` 제네릭).
- [x] **5. 켈트너·돈치안·PSAR·피벗** — 완료(2026-07-17, 8277b64): dispatch에 xNow/futBars/focused 전달 + 켈트너(중심 `_projFwd`+상/하단 `_projFaintLine`)·PSAR(감쇠 점렬 투영)·돈치안(중심 투영+상/하단 수평유지=롤링 후행 정직)·피벗(정적이라 선 이미 미래연장→포커스 P 강조+도달라벨). `_projFaintLine`/`_projHeldLine` 헬퍼 신설. **→ 오버레이 투영 100%.** 작도 전용·엔진 불변(246/246). spec `2026-07-17-overlay-projection-design.md`.
- [ ] (후속) 오실레이터는 서브패널이라 가격공간 투영 대상 아님 — 필요 시 별도.

## 진행 로그 (완료 시 체크 + 커밋 해시)
- [x] Phase 0: 계획서 저장 + 메모리 등록
- [x] Phase 1: 추세선 — 이미 투영됨(확인). parity 라벨은 후속
- [x] Phase 2: 이동평균 투영 (커밋 대기)
- [x] Phase 3: 일목균형 — 이미 구름 투영됨(확인). parity 라벨은 후속
- [~] Phase 4: 성능 — 투영은 focused 시에만 그려짐(포커스 1개). analyze는 _an 캐시. 배포 진행
- [x] Phase 5a: 추세선(중기 도달 예상가)·일목(미래 구름 밴드) 포커스 end-label parity 완료
- [x] Phase 5b: 볼린저(중심)·VWAP·슈퍼트렌드(추세색) 투영 완료 — _projFwd 제네릭 헬퍼(강조 글로우+끝점+라벨). 총 6지표 포커스 투영
- [~] Phase 6(심화·1차): 융합 구조 개편 — 지표를 예상/반대로 분리(_cdir0), 예상지표 합은 ±0.28 캡, **반대지표는 예상의 절반 가중으로 항상 되돌림**(기존 단순합은 캡 포화 시 반대효과가 가려짐). 129 테스트 통과. (커밋 대기)
- [ ] Phase 6(2차): 각 지표 투영곡선(_projFwd류)을 엔진에서 계산해 콘 형상에 직접 반영(현재는 스칼라 bias→선형 램프)
- [ ] 결정론적 클라이언트 계산 논의(사용자와)

## 검증
- `node map/forge-core.test.js` 129+ 통과 유지(엔진 변경 시).
- 헤드리스: 각 지표 포커스 시 미래 구간에 투영선+라벨 렌더 확인.
- 성능: 포커스 전환 외 프레임엔 투영 재계산 없음.

## 참고
- `_focusInd`(포커스 지표 blockType), `_anGet(P,key,compute)`(프레임 메모이즈), `_mainGeo`(toXf/toY/seamX/path/anchor), `drawEvidence`.
- 배포: `git add map/forge.html map/forge-core.js && push && lftp put`(forge-core.test.js 배포 금지, 서버 데이터 파일 불가침).

## 엔진 융합 검증 (2026-07-04)
`forge-core.js` `run()` 확인 결과 **융합은 실제로 독립 해석 기반**(피상적 아님):
- 각 지표 `analyze<Ind>` → 독립 `.bias`(-1..1, 고유 로직: MA국면·피보S/R·RSI다이버전스·MACD교차·일목구름·구조BOS 등).
- `run()`서 bias → **지표별 상한 드리프트**(maDrift ±10%·fibDrift ±8%·rsiDrift ±6%·macdDrift ±7%·icDrift ±7%…) × `_prof.trendScale`(TF) × `DW(type)`(사용자 가중).
- `_auxSum`=전 지표 드리프트 합 → `_auxCap`(±0.28) → 예측경로 `m = rev+mom+trend+sig+seas+_auxCap*(k/futW)`.
- 컨플루언스 = 종합방향과 일치하는 지표 bias 비율(라인 1477).
→ **가중 앙상블**. "빠른" 건 결정론적 클라이언트 계산이라서지 피상적이라서가 아님.
**심화 여지(로드맵)**: 현재는 지표당 스칼라 bias→선형 드리프트. 각 지표의 **전체 미래 투영 곡선**을 예측에 직접 반영하면 더 정밀(엔진 진화 과제).
