# 종목 추가 통합 모달 + 동선 정리 설계

- 날짜: 2026-07-17 · 상태: 승인됨 · 성격: UX 버그수정 + 동선 통일
- 배경(진단): 모바일 `+` 칩 → `newDoc()` → `_showAddTicker()`가 입력창을 **숨겨진 사이드바 섹션**(`.side-sec:first-child{display:none}` @860px)의 `#addTickerSlot`에 렌더 → 헤드리스 확증(가시성 0·조상 `.side-sec` display:none). 그래서 모바일 종목 추가 불능. 또한 티커 입력 경로가 둘(워치리스트 add vs 차트패널 `#tkSym`)이라 혼란.
- 결정: **PC·모바일 공통 통합 추가 모달**로 진입점 일원화(사용자 승인).

## 1. 목표
"종목 추가"를 어디서 눌러도(PC 사이드바 버튼·모바일 `+` 칩) **화면 중앙에 보이는 경량 모달**이 떠서, 티커 입력+자동완성 → 추가 즉시 워치리스트 등록 + 자동 로드/분석. 숨은 슬롯 인라인 의존 제거.

## 2. 변경 (forge-ui.js + forge.css)
### `_showAddTicker()` 재작성 (forge-ui.js:270)
- 기존: `#addTickerSlot` 인라인 렌더(숨김 이슈). → **모달 오버레이 생성·표시**:
  - body(또는 고정 컨테이너)에 `#tkAddOv`(`.tkadd-ov`) 없으면 생성, 내부 `.tkadd-box`: 제목 "종목 추가" + `input#addTkIn` + `#addTkSugg`(자동완성) + `추가`(`#addTkGo`)·`취소` 버튼.
  - `_wireSuggest(inp, sugg, sym => { _closeAddModal(); _addTickerDoc(sym); })` 재사용(자동완성 선택=즉시 추가).
  - Enter=submit·Esc=닫기·`추가` 클릭=submit·백드롭 클릭=닫기. submit: `v=inp.value.trim().toUpperCase(); _closeAddModal(); if(v) _addTickerDoc(v)`.
  - 표시 후 `inp.focus()`. **blur-자동닫기 제거**(모달이라 불필요 — 모바일 blur 버그 원인 해소).
- `_closeAddModal()`: 오버레이 `.open` 제거(또는 숨김). `_hideAddTicker`는 이 이름으로 대체/유지.

### `newDoc()` 단순화 (forge-ui.js:296)
- 프롬프트 폴백 제거 → 항상 `_showAddTicker()`(모달은 어디서나 동작).

### CSS `.tkadd-ov` / `.tkadd-box` (forge.css)
- `.tkadd-ov{position:fixed;inset:0;z-index:120;display:none;align-items:center;justify-content:center;background:var(--scrim)}` `.tkadd-ov.open{display:flex}`
- `.tkadd-box{width:min(420px,calc(100vw - 32px));background:var(--panel);border:1px solid var(--line);border-radius:var(--r-lg);box-shadow:0 16px 44px rgba(0,0,0,.5);padding:16px}` — 토큰만·좌측 accent 금지.
- 입력/버튼은 기존 `.add-tk-in`/`.add-tk-go`/`.tk-sugg` 스타일 재사용·정렬. 모바일서 자동 중앙·폭 반응형.

## 3. 차트패널 `#tkSym` (Flow B)
- **유지**(현재 종목 노드 심볼 편집·불러오기 = 유효한 보조 기능). 이번 스코프는 **추가 진입점 통일**에 집중 — `#tkSym` 로직·불러오기 흐름은 destabilize 하지 않음.
- 혼란 완화는 "종목 추가"가 모든 기기서 제대로 동작하게 되는 것으로 1차 해소. (라벨/비활성 등 추가 명확화는 후속 선택.)

## 4. 검증
- **헤드리스 PC(1680)·모바일(390)** 각각: `+`/`종목 추가` → **모달 가시(visible·중앙)** → 티커 입력 → 추가 → 워치리스트에 반영(`.doc-row .doc-nm`/`.m-chip`) + pageerror 0. before(모바일 불능)/after 대조.
- `node --check forge-ui.js`·`node --test forge-core.test.js` 246/246(엔진 무관).
- Esc·백드롭·취소로 닫힘, autocomplete 선택 즉시 추가 동작.

## 5. 격리 / 산출
- 변경: `forge-ui.js`(_showAddTicker·newDoc·_hideAddTicker→_closeAddModal), `forge.css`(.tkadd-*), 캐시버스터 bump(forge-ui.js·forge.css·forge.html). 엔진/PHP/데이터 불변.
- 커밋+배포 한 세트. 스코어카드 개선이력 1줄(선택).

## 6. 리스크
- 모달 z-index/포커스가 기존 팝오버(alert-pop·chart-pop)와 충돌 → z-index 120·Esc 처리로 격리, 헤드리스 확인.
- `_hideAddTicker` 참조처 잔존 → grep로 전부 `_closeAddModal`로 정합.
