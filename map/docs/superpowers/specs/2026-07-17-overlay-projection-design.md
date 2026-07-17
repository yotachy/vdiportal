# 미투영 오버레이 4종 미래 투영 작도 설계

- 날짜: 2026-07-17 · 상태: 승인됨 · 성격: 작도 전용(엔진 불변)
- 배경: 지표 미래 투영 과제([[scoopforge-indicator-projection-task]]) — 9지표(추세선·이동평균·일목·볼린저·VWAP·슈퍼트렌드·엘리어트·사이클·Gann)는 포커스 시 미래 투영 완료. **켈트너·돈치안·PSAR·피벗** 4종만 미투영 → 완성해 오버레이 투영 100%.
- 방침: 실적 축 제거 후 엔진은 가격 전용 유지 → 이번 작업은 **작도 전용**(forge-draw.js만·엔진/테스트 불변, 246/246 무관).

## 1. 원칙
- 포커스(`_focus === blockType`) 시에만 투영. `M.focused && M.xNow != null && M.futBars` 게이팅(볼린저 선례).
- 성능: 투영은 포커스 1지표만·프레임 재계산 최소(기존 `_anGet` 캐시 계열 데이터 사용).
- 손그림 reveal 정합: 투영은 본선 노출 후(`reveal>=2` 또는 `_skReady()`) 등장.
- 좌표: `M.xNow`(=seamX 현재/미래 경계)~`M.xRight`(플롯 우단), `pToY`. `futBars`=예측 봉수.

## 2. dispatch 보강 (forge-draw.js)
4종 `_draw*Layers` 호출부(현 2785 피벗·2793 PSAR·2797 켈트너·2801 돈치안)에 볼린저(2731)와 동일하게 추가:
`xNow: g.seamX, futBars: (g.path && g.path.length) || 24, focused: (_focus === "<key>")` (key=pivot/psar/keltner/donchian).

## 3. 지표별 투영

### 켈트너 채널 (`_drawKeltnerLayers`) — 움직이는 밴드
- 포커스 시: 중심 `_projFwd(c, kt.midArr, nowFi, M.xNow, xr, M.futBars, pToY, COL, "켈트너 중심 투영")`(재사용·감쇠 기울기+끝점+도달 라벨).
- 밴드: 현재 폭 `w = kt.upperArr[nowFi] - kt.midArr[nowFi]`(하단 대칭)를 **유지**해 투영 중심±w를 흐린 점선으로 미래 연장(중심 감쇠곡선 재계산 없이 중심 투영 끝값 기준 ± w). 신뢰 낮으면(midArr[nowFi] 비유효) 생략.

### PSAR (`_drawPsarLayers`) — 가속 추적점
- 포커스 시: SAR 계열 최근 기울기(window ~min(24,futBars/2))로 **감쇠 연장한 점렬**을 미래 구간에 방향색(상승 `#46c28e`/하락 `#e06a6a`)으로 점 투영 + 끝점 라벨 "SAR 투영 ≈ {가격}". (SAR 내부 AF/EP 미보유 → 계열 기울기 감쇠가 정직한 근사, 다른 오버레이와 일관.)

### 돈치안 채널 (`_drawDonchianLayers`) — 롤링 max/min(후행)
- 포커스 시: 중심 `_projFwd(c, dc.midArr, …, "돈치안 중심 투영")`. 상/하단은 **현재값 수평 유지**(돌파 전까진 평평한 게 정직) 흐린 점선으로 미래 연장. 라벨 접두 유지("DC"/중심 투영 라벨).

### 피벗 (`_drawPivotLayers`) — 정적 S/R
- 피벗선은 이미 `xR`(=xRight, 미래 포함)까지 그려짐 → 실제 선 연장은 불필요.
- 포커스 시: P선을 강조(밝게)하고 끝점에 "피벗 P ≈ {가격}" 라벨(9지표 도달 라벨 parity). 상위 강조 레벨(지지/저항 K개)도 포커스 시 도달 라벨 유지.

## 4. 검증
- `node --test forge-core.test.js` = **246/246 유지**(forge-draw.js는 테스트 무관·엔진 불변).
- 헤드리스: 4지표 각 포커스 시 미래 구간에 투영선/점렬/밴드 + 도달 라벨 렌더 확인(비포커스 시 미표시).
- 성능: 포커스 전환 외 프레임에 투영 재계산 급증 없음(계열 데이터 재사용).

## 5. 격리 / 산출
- forge-draw.js 단일 파일 수정 + forge.html 캐시버스터(forge-draw.js?v=) bump. 엔진·PHP·데이터 불변.
- 완료 시: 진행 과제 문서 `indicator-forward-projection.md` Phase 로그 갱신(오버레이 투영 완성) + 커밋+배포.

## 6. 리스크
- 돈치안/피벗은 정적·후행이라 투영이 '평평'하게 보일 수 있음 — 의도된 정직 표현(가짜 기울기 금지).
- PSAR 계열 기울기 감쇠는 실 SAR 재귀와 다를 수 있음(근사) — 라벨에 "투영"(추정) 명시, 과신 방지.
