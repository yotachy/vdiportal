# 2·3패널 접기 — 설계

- 날짜: 2026-08-05
- 대상: `forge.html`(차트 헤더) · `forge.css` · `forge-app.js`
- 상태: 설계 승인됨

## 1. 배경

차트 영역이 좁고 답답하다는 사용자 요구. 현재 `.forge-split`은 가로 flex다:

```
[ 2패널 board-pane 560px | 거터 4px | 3패널 ind-rail 178px | 4패널 chart-pane 1fr ]
```

둘을 접으면 차트가 **약 742px** 넓어진다. 지금은 거터 드래그로 2패널 폭만 줄일 수 있고(`min-width:320px` 하한), 3패널은 접는 수단이 없다.

## 2. 설계

### 2.1 버튼 위치 — 차트 헤더 오른쪽, 전체화면(⛶) 앞

헤더의 정렬 세그(`⬍세로 ⬌가로 ✦은하`)는 이미 `.forge-top .seg{display:none}`으로 숨겨져 있어("사실상 미사용", `forge.css:156`) 거기 붙이면 보이지 않는다.

**차트 패널 헤더 `.fc-phead > .fc-head-actions`의 `#fcExpand` 바로 앞**에 세그 하나를 둔다.

```
가격 차트  AAPL 5014봉 …   [분석근거▾][리스크][최적화]  [▣ 보드][▤ 지표] [⛶]
```

처음에는 "차트 왼쪽 버튼이 차트 왼쪽 패널을 제어"라는 직관 때문에 `.fc-head-left` 맨 앞을 택했으나, **헤드리스 검증에서 결함이 드러나 오른쪽으로 옮겼다.** 시연 진행 HUD(`.play-hud`)가 `position:fixed; left:12px; top:66px; z-index:95`로 **뷰포트에 고정**돼 있어, 2·3패널을 모두 접으면 차트 헤더의 왼쪽이 그 아래로 들어가 **버튼이 가려진다**. 버튼이 가려지면 패널을 되돌릴 수단이 사라진다.

z-index를 올려 해결하는 선례가 있으나(`body.chart-fs .fc-phead{z-index:97}`, `forge.css:1722`) 그러면 이번엔 HUD의 드래그 손잡이가 헤더 밑에 깔려 시뮬레이션 진행창을 움직일 수 없게 된다. 충돌을 만들지 않는 배치가 낫다.

오른쪽 배치의 이점:
- 떠 있는 오버레이가 없어 어떤 접힘 조합에서도 가려지지 않는다
- `⛶ 전체화면`과 함께 "차트 영역 넓히기" 묶음이 되어 의미가 맞는다
- 접은 뒤에도 차트 헤더는 항상 보이므로 되돌릴 수 있다

### 2.2 숨김은 CSS 클래스로, DOM 제거 금지

`body.hide-board` / `body.hide-rail`를 토글하고 CSS에서 `display:none`. 거터(`#forgeGutter`)는 보드와 함께 숨긴다 — 조절 대상이 없으므로.

**DOM에서 떼면 안 된다.** `renderTickerPanel`·`renderBoard`·`renderDashboard`가 모두 `getElementById`로 요소를 찾으므로 제거 시 조용히 깨진다. `display:none`이면 요소가 살아 있어 JS는 영향받지 않는다.

### 2.3 리핏 — 토글 후 직접 호출

`display` 변경은 `resize` 이벤트를 발생시키지 않아 차트가 이전 폭 그대로 남는다. 토글 직후 `fitHeroHeight(false)` + `redrawCharts()`를 직접 부른다(거터 드래그가 쓰는 것과 같은 경로, `forge-app.js:1327`).

보드가 숨겨진 동안 그 안의 서브패널 캔버스(RSI·거래량·CCI)는 `clientWidth`가 0이 된다. 기존 폴딩 패널이 `display:none` 대신 `max-height:0`을 쓴 이유가 이것이다(`forge.css:642` — "접힌 상태서도 캔버스 정상 작도·clientWidth 유지"). 가로 접기엔 그 수법을 쓸 수 없으므로 **펼 때 `redrawCharts()`로 재작도**해 해결한다. 접힌 동안 0폭 캔버스에 그리는 것은 무해하다(보이지 않을 뿐).

### 2.4 영속

`localStorage["scoopforge_panes"]` = `{board:bool, rail:bool}` (true = 숨김). 기존 `scoopforge_board_w`·`scoopforge_risk`와 동일한 try/catch 관례. 부팅 시 복원한다.

### 2.5 모바일 (`≤860px`)

세로 스택(`.chart-pane{order:-1}`)이고 `.ind-rail{display:none}`이 이미 걸려 있어 접기가 무의미하다.

- 버튼 세그 숨김
- **`body.hide-board`가 걸려 있어도 `.board-pane`은 복원**(`display:flex`) — PC에서 접어둔 상태로 폰에서 열었을 때 보드가 영영 안 보이는 것을 막는다

### 2.6 기존 전체화면과의 관계

`body.chart-fs`는 **임시**(Esc 해제), 이 접기는 **지속**이다. 서로 독립이며 충돌하지 않는다. 전체화면 중에는 `.forge-split`이 보이지 않아 버튼도 자연히 무의미해진다.

## 3. 검증

- `node --check forge-app.js` · `node --test forge-core.test.js` 251건 회귀
- 헤드리스 스크린샷: ①기본 ②보드만 접기 ③지표만 접기 ④둘 다 접기 — 차트 폭이 실제로 넓어지고 작도가 새 폭에 맞게 다시 그려지는지
- 재방문 시 접힘 상태 복원
- 모바일 폭(≤860px)에서 버튼 숨김 + 보드 복원
- **읽기 경로만 사용** — `loadTicker`·`_addTickerDoc` 호출 금지(사용자 실데이터 손상)

## 4. 범위 밖

- 1패널(종목 워치리스트) 접기 — 요청 범위 밖이며 이미 `toggleSide` 계열 수단이 있다
- 접힌 폭을 애니메이션으로 전환 — `display:none`은 트랜지션 대상이 아니고, 폭 애니메이션은 매 프레임 차트 재작도를 유발해 비싸다
