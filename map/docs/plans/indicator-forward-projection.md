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
- [ ] (후속) 볼린저·VWAP·슈퍼트렌드·피보 등 확장.

## 진행 로그 (완료 시 체크 + 커밋 해시)
- [x] Phase 0: 계획서 저장 + 메모리 등록
- [x] Phase 1: 추세선 — 이미 투영됨(확인). parity 라벨은 후속
- [x] Phase 2: 이동평균 투영 (커밋 대기)
- [x] Phase 3: 일목균형 — 이미 구름 투영됨(확인). parity 라벨은 후속
- [~] Phase 4: 성능 — 투영은 focused 시에만 그려짐(포커스 1개). analyze는 _an 캐시. 배포 진행
- [ ] Phase 5(후속): 추세선·일목 '도달 예상가' end-label parity + 볼린저/VWAP/슈퍼트렌드 확장

## 검증
- `node map/forge-core.test.js` 129+ 통과 유지(엔진 변경 시).
- 헤드리스: 각 지표 포커스 시 미래 구간에 투영선+라벨 렌더 확인.
- 성능: 포커스 전환 외 프레임엔 투영 재계산 없음.

## 참고
- `_focusInd`(포커스 지표 blockType), `_anGet(P,key,compute)`(프레임 메모이즈), `_mainGeo`(toXf/toY/seamX/path/anchor), `drawEvidence`.
- 배포: `git add map/forge.html map/forge-core.js && push && lftp put`(forge-core.test.js 배포 금지, 서버 데이터 파일 불가침).
