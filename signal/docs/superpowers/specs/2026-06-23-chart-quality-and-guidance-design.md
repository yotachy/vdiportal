# 차트 품질·해석 개편 설계 문서

- 작성일: 2026-06-23
- 대상: `signal/scoopsignal.html` (단일 정적 HTML)
- 성격: 상세 차트 뷰의 렌더 선명도·가독성·해석성 개선. 점수 산식·데이터 로더·뷰 라우터 로직 불변.

## 1. 배경 / 목적

상세 차트(예: 순발행·공급, 이미지 3)에서 사용자 지적:
1. **흐릿함(blur)**: 캔버스 텍스트·선이 선명하지 않음 — 모든 차트 공통.
2. **차트가 너무 큼**: 캔버스 높이 과다.
3. **축 라벨 겹침**: 좌측 세로축 회전 제목이 Y눈금값과 겹침 + 큰 수 포맷 투박(`121906k`).
4. **해석 부족**: 라인만 있고 "지금 무엇을 보고 판단해야 하는지" 가이드·기준선이 없음.
5. **자산 탭 가독성** 여전히 낮음.

원인 진단:
- blur = `lineChart`가 캔버스 백스토어를 `clientWidth×devicePixelRatio`로 잡는데 `html{zoom:1.35}`를 보정하지 않아 1.35배 업스케일(흐림). `drawHeatmap`·`drawCycle`·스네일·KPI 스파크라인도 동일.
- 축 겹침 = 회전 yLabel이 `pad.l=56`에서 7자 눈금값(`120933k`)과 겹침.

## 2. 목표 (사용자 확정)

- 전 캔버스 **선명도 보정**(DPR×zoom).
- 차트 **높이 축소**.
- 축 **가독성**(회전 제목 제거, 큰 수 M 포맷, 패딩·X눈금 정리).
- **판단 카드 + 기준선**: 차트마다 판정·해석·참고 포인트 + 의미 있는 기준선/구간 음영.
- **자산 탭 가독성** 추가 개선.

## 3. 비목표 (YAGNI)

- 점수 산식·데이터 로더·뷰 라우터 변경. 새 데이터 소스. 차트 라이브러리 도입(canvas/SVG 직접 유지).

## 4. 공통 인프라 변경

### 4.1 캔버스 선명도 보정 (blur 해결) — 전 차트

신규 헬퍼 `hidpi(cv)`: 캔버스 백스토어를 **실제 화면 device px**(zoom 포함)로 잡고 컨텍스트를 그 비율로 스케일.
```js
function hidpi(cv){
  const dpr=window.devicePixelRatio||1, r=cv.getBoundingClientRect();
  const W=cv.clientWidth||r.width, H=cv.clientHeight||r.height;
  const z=(W?r.width/W:1)||1;            // CSS zoom 보정(≈1.35)
  const s=dpr*z;
  cv.width=Math.round(W*s); cv.height=Math.round(H*s);
  const ctx=cv.getContext('2d'); ctx.setTransform(s,0,0,s,0,0); ctx.clearRect(0,0,W,H);
  return {ctx,W,H};
}
```
- `lineChart`·`drawHeatmap`(heatmap은 DOM이면 무관)·`drawCycle`·스네일(`spiral`)·`sparkline`이 `hidpi(cv)`를 사용하도록 교체(각자 W/H/ctx를 받아 좌표계는 CSS px 그대로).
- (heatmap이 canvas가 아니라 DOM 그리드면 해당 없음 — 구현 시 확인.)

### 4.2 `fmtTick` 큰 수 포맷

`fmtTick`에 백만(M)·십억(B) 추가: `a>=1e9 → (v/1e9).toFixed(1)+'B'`, `a>=1e6 → (v/1e6).toFixed(a>=1e8?0:1)+'M'`, 그 아래 기존. (`121906k` → `121.8M`.)

### 4.3 `lineChart` 옵션 확장 — 기준선·구간 음영

옵션 추가: `refLines`(수평 기준선)·`zones`(Y값 구간 음영). 시그니처:
```js
lineChart(cv, datasets, {logY, xTicks, xLabel, yLabel, refLines=[], zones=[]})
// refLines: [{v:값, color:'--bear', label:'과열', dash:[4,3]}]
// zones:    [{from:값, to:값, color:'rgba(...)' 또는 토큰tint, label:'저평가'}]
```
- zones는 그리드 뒤에 먼저 그림(반투명 음영), refLines는 데이터 라인 위/아래 적절히(수평선 + 우측 라벨).
- 회전 `yLabel` 기본 미사용(아래 4.4) — 시그니처는 유지하되 호출에서 제거.

### 4.4 축·여백 정리

- 회전 세로축 제목 제거(호출부에서 `yLabel` 미전달). 좌측 패딩 `pad.l`은 M 포맷(최장 ~6자)에 맞게 유지/소폭 조정.
- X눈금 라벨 겹침 방지: 라벨 폭 기준 최소 간격 확보(겹치면 일부 생략) — `xTicks` 렌더 시 직전 라벨 우측 끝과 겹치면 skip.

### 4.5 캔버스 높이 축소

뷰별 canvas 높이 CSS를 하향: 일반 라인차트 `clamp(360px,52vh,460px)` → `clamp(260px,38vh,360px)`; 스네일 `clamp(440,66vh,600)` → `clamp(360,52vh,480)`; supply/defidom 동일 기준 적용. (정확 수치는 plan에서.)

## 5. 판단 카드 (`.chart-guide`)

차트(또는 스탯 블록) **아래**에 해석 카드. 박스 남발 금지(약한 틴트 면, 보더 없음).

- 구조: `판정 배지`(강세 전환 우호 / 중립 / 약세 관점 — `--bull/--neutral/--bear` 색) + `해석`(1~2줄, 현재 구간 의미) + `참고 포인트`(무엇을 보면 되는지 1줄).
- 렌더 헬퍼: `chartGuide(view, {sig, verdict, reading, watch})` → 해당 뷰의 `[data-guide="view"]` 컨테이너에 주입. 각 상세 뷰 마크업에 `<div class="chart-guide" data-guide="{view}"></div>` 추가.
- **판정(sig)·값은 기존 `S._metrics`·`S` 계산에서 도출**(일관, 재계산 없음). 해석/참고 문구는 차트별 정적 템플릿 + 현재값 보간.
- 적용 뷰: 라인/값 차트 전체 — `band·mayer·dd·vol·supply·defidom` + 커스텀 `season·cycle·spiral·halving`, 그리고 스탯형 `gas·staking·treasury·squeeze·trigger·etf`(이미 readout 있음 → 판정 배지+참고만 가볍게). 데이터 없으면 카드 숨김(그레이스풀).
- 문구는 **중립·사실 기반**(투자 권유 아님), 기존 면책과 일관.

### 5.1 기준선/구간 예시 (plan에서 정확 확정)

- `mayer`(200주배수): 저평가 <0.8·과열 >2.4 구간 음영 + 1.0 기준선.
- `band`(로그밴드): ±1σ·±2σ 밴드(기존 회귀 채널 활용) + z 현재 위치.
- `dd`(드로다운): 0선 + 약세 바닥권(-50%↓) 음영.
- `vol`(변동성): 압축 구간(하위) 음영.
- `supply`(순발행): 구간 시작 대비 0선(증가=인플레/감소=디플레) 기준 + 방향 해석.
- `defidom`: 추세 + 현재 비중 기준선.
- `season`(히트맵): 이번 달 셀 강조(기존) + 평균행 해석.
- `cycle`·`spiral`·`halving`: 바닥/반감기 기준 경과 위상 해석.

## 6. 자산 탭 가독성 (추가)

비활성 탭 색 명도 상향(`--faint`→`--muted` 또는 그 사이), 활성(이더리움) 골드 강조 강화(채움 또는 굵은 underline), `준비중` 칩 더 작고 흐리게(라벨 자체는 또렷). 1280·390 모두 또렷.

## 7. 그레이스풀 / 검증

- 데이터 없으면(지오블록 등) 차트·판단 카드 숨김 또는 "연결 필요"(기존 가드 유지).
- blur 보정은 zoom·DPR 무관하게 동작(헤드리스 devicePixelRatio=1에서도 z 보정으로 정상).

## 8. 검증

- **헤드리스 스크린샷** 상세 뷰 다수(supply·band·mayer·dd·vol·season·cycle·spiral·defidom) 1280/390:
  - 캔버스 텍스트 **선명**(백스토어 = clientWidth×dpr×zoom 확인).
  - 회전 축 제목 없음·Y눈금 M 포맷·라벨 겹침 0·차트 높이 축소.
  - 판단 카드(판정 배지+해석+참고) 표시·판정 색이 `S._metrics` sig와 정합.
  - 기준선/구간 음영 표시.
  - 자산 탭 또렷.
- JS 에러 0, 점수·뷰 라우터·데이터 회귀 0. KPI 스파크라인도 선명.
- 육안: "흐릿·과대·해석부족" 해소.

## 9. 엣지 / 주의

- `hidpi`는 `getBoundingClientRect`가 0(비표시 뷰)일 때 가드 — 차트는 활성 뷰에서만 그려지므로(`VIEW_DRAW`/`drawActiveView`) 표시 시점에 호출.
- 판단 카드 문구는 과최적화·단정 회피, 중립 서술.
- `lineChart` 시그니처 확장은 기존 호출 100% 하위호환(새 옵션 기본값 빈 배열).
- 캔버스 높이 축소가 사이클 시계/스네일 비율을 깨지 않도록 종횡 확인.
