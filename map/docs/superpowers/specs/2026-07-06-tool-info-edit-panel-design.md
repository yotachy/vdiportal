# 도구 편집 창 — 설명 콘텐츠 + 추천값·저장 버튼 설계

- 날짜: 2026-07-06
- 대상: `map/forge.html` (UI만). `forge-core.js`·데이터 파일 미변경.
- 목적: 지표 편집 창(`renderParams` → `#paramPanel`)에 **도구의 목적·정의·해석법 설명**을 넣고, **추천값 세팅** 버튼과 **저장** 버튼을 추가한다.

## 배경

현재 편집 창은 파라미터(numRow)·제목·이미지·서술메모만 있고, 지표가 무엇인지·어떻게 읽는지 설명이 없다. 파라미터는 입력 즉시 `input` 핸들러가 `n.params`에 반영하고 `fireBoardChange()`로 자동저장(markDirty)+엔진 변경표시하지만, **명시적 저장 버튼이 없어** 사용자가 저장 여부를 확신하기 어렵다. 파라미터를 기본값으로 되돌리는 수단도 없다.

## 결정 사항 (브레인스토밍 합의)

- 설명 콘텐츠: **전 지표 30종 · 간결**(목적/정의/해석법 각 1~2문장).
- 추천값 세팅: **내장 기본 파라미터로 리셋**(`BLOCK_DEFS[type].params`).
- 저장 버튼: **저장(영속)만** — 재분석은 기존 웹분석 버튼으로 별도.

## 구성 요소

### 1) `INDICATOR_INFO` 상수 (신규, forge.html 스크립트 상단 — `EV_LABEL` 인근)

```js
const INDICATOR_INFO = {
  ma: { p: "추세의 방향·기울기를 매끄럽게 파악.", d: "최근 N봉 종가의 (단순/지수) 평균선.", h: "가격이 위=상승 우위, 아래=하락 우위. 정배열·골든/데드크로스로 전환 판단." },
  // … 30종
};
```

- 키: 지표 blockType. 값: `{ p:목적, d:정의, h:해석법 }` 간결 한국어.
- 대상 30종: ma, trend, rsi, bollinger, macd, adx, volumeprofile, ichimoku, structure, atr, smc, cycle, vwap, supertrend, stochastic, fib, elliott, volume, phasefold, pivot, psar, keltner, donchian, cci, williams, roc, ao, aroon, mfi, cmf.
- 구조/데이터 블록(ticker, price, combine, predict, free/메모)은 제외 → 해당 노드 편집 시 안내 섹션 미표시.

### 2) 편집 창 렌더(`renderParams`) 추가

파라미터 섹션(`paramSec`) 직후에 삽입:

```
파라미터  [numRow …]
[추천값 세팅]  [저장]        ← .ne-actions 액션 행
도구 안내                    ← .ne-sec + .ne-info (INDICATOR_INFO[type] 있을 때만)
  목적  …
  정의  …
  해석  …
서술 메모 …
```

- **액션 행 `.ne-actions`**: `추천값 세팅` 버튼은 `rows.length>0`(파라미터 있는 노드)일 때만, `저장` 버튼은 항상. 버튼 스타일은 기존 `.tool-btn` 재사용.
- **도구 안내 `.ne-info`**: `INDICATOR_INFO[n.blockType]`가 있을 때만. 3행(목적/정의/해석), 각 행 = 작은 라벨(`.ne-info-k`) + 본문. 하드코딩 색 금지·좌측 accent line 금지(라벨은 텍스트/배경만).

### 3) 버튼 동작 (이벤트 위임 — `#paramPanel` click 핸들러 또는 인라인)

- **추천값 세팅** (`data-ne-recommend` 또는 `id=neRecommend`):
  - `const def = (BLOCK_DEFS.find(b=>b.type===n.blockType)||{}).params || {}; n.params = {...def};`
  - `renderParams()` 재호출(입력 UI 갱신) → `fireBoardChange()`(변경됨·자동저장) → `bToast("추천 기본값으로 설정")`.
- **저장** (`id=neSave`):
  - 현재 입력은 이미 `input` 핸들러로 `n.params`/`title`/`note`에 반영됨. 버튼은 **명시적 영속**: `markDirty()` 호출(서버/로컬 저장) + `bToast("저장됨")`. 재분석(runForge) 없음.

### 4) CSS (신규, `.node-editor` 스코프)

- `.node-editor .ne-actions{display:flex;gap:8px;margin:2px 0}` (버튼 나란히)
- `.node-editor .ne-info{...}` / `.ne-info-row{display:flex;gap:8px}` / `.ne-info-k{flex:0 0 34px;color:var(--eth);font-weight:700;font-size:11px}` / 본문 `font-size:11.5px;color:var(--muted);line-height:1.5`.
- 다크테마 토큰만 사용.

## 데이터 흐름

`renderParams(n)` → `INDICATOR_INFO[n.blockType]` 조회 → 안내 섹션 HTML 조립 → `#paramPanel.innerHTML`에 포함. 버튼 클릭 → 기존 `panel` 이벤트 위임에 분기 추가(`n.params` 리셋 / markDirty) → 필요 시 renderParams 재호출.

## 테스트/검증

- 코어 단위테스트 무영향(forge-core 미변경) — 기존 183/183 유지.
- 헤드리스: ①여러 지표 노드 선택 시 편집창에 목적/정의/해석 3행 표시 ②추천값 세팅 클릭 → 파라미터 입력값이 BLOCK_DEFS 기본값으로 바뀜 ③저장 클릭 → 토스트·에러없음 ④구조 블록(ticker 등) 선택 시 안내 섹션 미표시 ⑤JS 에러 0.

## 제약 / 비목표

- 단일 HTML·바닐라 JS 유지. 좌측 accent line 금지. 다크+골드 토큰만.
- 비목표: 타임프레임별 추천값, 저장+재분석 통합, 구조 블록 설명, 다국어.
- 배포 불가침 데이터 파일 미변경.
