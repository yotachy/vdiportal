# 스쿱포지 Phase 4-B (R2) — 대표 이미지 = 우측 가격차트 설계

- 날짜: 2026-06-26
- 선행: Phase 4-A(포지 리브랜드 + 세로 정렬) 배포.
- 상태: 컨셉 합의 완료 → 구현 설계. **대전환 R2(표시 레이어). R4/R5(비전 분석)는 이후.**

## 1. 목표

포지의 **대표 이미지를 우측 패널의 가격차트로 크게** 띄운다(가격차트 ≡ 대표 이미지). 이미지 오른쪽 "미래 존"에 현재 계산된 예측을 미리보기로 잇는다. 좌측 보드 상단 배너는 제거하고, 분석 리드아웃(PDM/폴드/시그널)은 아래에 유지. **R2는 "그릇"** — 이미지 위 정밀 보조선·축 정렬·노드별 분석은 R4/R5(비전).

확정 결정: **이미지 히어로 + 리드아웃 아래 유지** · **상단 배너 제거(우측에만 크게)** · **미래 존엔 현재 계산 예측 미리보기**.

## 2. 레이아웃 변경 (`forge.html`)

### 2.1 상단 배너 제거 (보드 페인)
- `boardInit`이 생성하던 `#themeBar`(`.forge-theme`) 마크업 제거 → 보드 stage가 공간 회수.
- `.forge-theme` CSS 제거. `th-title` focusout 리스너 제거(제목 편집은 사이드바 이름변경 ✎로 일원화 — `renameDoc` 기존).
- `renderTheme()`는 배너 대신 **우측 히어로 갱신(`renderHero()`)** 으로 리포인트. `setThemeImg`/`loadDoc`/`renameDoc`에서 `renderTheme`→`renderHero` 호출(또는 renderTheme를 renderHero 위임으로). 주제 이미지 지정 경로(라이브러리 드래그 / Ctrl+V 무선택 → `setThemeImg`)는 그대로, 표시만 우측.

### 2.2 우측 패널 재구성 (`.chart-pane` / `.fc-wrap`)
- **히어로(상단, 크게)**: 기존 `#fcMain`(캔들 메인차트) 영역을 `.fc-hero`로 대체.
  - `.fc-hero` = 좌측 **대표 이미지**(`<img>` object-fit:contain, flex로 큼) + 우측 **예측·미래 존** 캔버스 `#fcFuture`(고정 폭 ~220px).
  - 이미지 없으면 "라이브러리에서 대표 이미지를 드래그하세요" 플레이스홀더.
- **리드아웃(아래)**: 기존 `#fcPdm` + `#fcFoldA/B/C`(+시그널) 유지(데모). R5에서 비전 연동. verdict 배지 유지.

## 3. 렌더 (`forge.html`)

- `renderHero()`: 활성 포지(`themeState.imgId`=활성 doc themeImgId) 이미지를 `.fc-hero` 이미지 슬롯에 `imgSrc(themeState.imgId)`로 표시. 없으면 플레이스홀더. 이미지 교체(드래그/Ctrl+V/문서 전환) 시 즉시 갱신(차트 ≡ 대표 이미지).
- `renderChart(result, data)`: `fcDrawMain` 호출 **제거**(캔들 메인 미사용). 대신 (a) `renderHero()` 보장, (b) `#fcFuture`에 **현재 계산 예측 미리보기**: `result.prediction`(path/lo/hi, anchor)을 미래 존 좌측 끝(seam="지금")에서 시작하는 콘+선으로 그림(미래 존 자체 y-스케일 사용 — 이미지 가격축 정렬은 R5). (c) 기존 `fcDrawPdm`/`fcDrawFold` 리드아웃 유지.
- 오버레이: `renderOverlay`의 `#fcMain` 대상 `drawConsensus`/`drawCone`는 **R2에서 비활성**(#fcMain 제거로 좌표원 사라짐 — R5에서 이미지 위로 부활). 보드 펄스(`startPulse`, `#boardOverlay`)는 유지. `#fcOverlay`(차트 오버레이) 제거 또는 미사용.

## 4. 데이터/계약

- 변경 없음(서버/문서 모델 동일). `themeImgId`가 곧 대표 이미지(=차트). 예측 미리보기는 기존 `ForgeCore.run` 출력(`prediction`) 사용 — 데이터는 여전히 데모(R5에서 비전).

## 5. 검증

- 헤드리스(오프라인 또는 임시 사본 절대 API): 라이브러리에 이미지 추가→드래그로 대표 지정 시 **우측 히어로에 크게** 표시, 미래 존에 예측 콘 미리보기, 상단 배너 없음, 문서 전환 시 히어로 이미지 교체, 콘솔 에러 0.
- forge-core.js 무변경 → `node --test map/forge-core.test.js` 15/15.
- 라이브 배포(forge.html). 기존 map 파일·forge 데이터 불가침.

## 6. 비범위

- 이미지에서 데이터/축 추출(비전), 이미지 위 정밀 보조선·축 정렬, 노드별 분석/포지 분석 재생, 파동스캔·엘리어트 블록 = R4/R5. 미래 존 예측은 데모 기반 미리보기(이미지 축과 정밀 정렬 X).

## 7. 리스크/주의

- `#fcMain`/`#fcOverlay` 제거가 `fcDrawMain`/`drawCone`/`drawConsensus`/`fcMap` 호출과 얽힘 — 호출부를 안전히 제거/우회(함수 정의는 남겨도 미호출). renderChart·renderOverlay에서 깨지는 참조 없게 정리.
- `renderTheme` 호출 지점(loadDoc/setThemeImg/renameDoc) 전부 히어로 갱신으로 정합. 배너 제거 후 dangling 참조(`#themeBar`/`.th-title`) 없게.
- 제목 편집 일원화: 배너 제거로 제목은 사이드바 ✎(renameDoc)만. renameDoc가 themeState.title도 갱신(기존).
- 보드 stage 공간 회수 후 좌표/오버레이(보드 펄스) 정합 — 보드 페인 기준이라 영향 적으나 확인.
- 미래 존 y-스케일은 예측값 기준(이미지와 정밀 정렬 아님 — 의도, R5에서 정렬). 사용자에 "미리보기" 톤으로.
- 단일 페이지·바닐라·noindex·FORGE_API 상대. map 불가침.

## 8. 확정된 결정

1. 우측 = 히어로(대표 이미지=가격차트) + 아래 리드아웃(PDM/폴드/시그널 데모).
2. 상단 배너 제거(우측에만 크게), 제목은 사이드바 ✎.
3. 미래 존 = 현재 계산 예측 미리보기(seam에서 이어 그림). 정밀 축 정렬은 R5.
4. `#fcMain` 캔들 메인 + 차트 합의/콘 오버레이는 R2 비활성(R5 이미지 위 부활).
