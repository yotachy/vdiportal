# 머니스쿱 모바일 — 디자인 시안용 기능 분해도

> 이 문서는 **디자인 시안을 만들기 위한 화면정의서**다. 현재 구현된 것과 **곧 구현될 것**을 모두 담는다.
> 시안이 도착하면 여기 적힌 요소들을 그 시안에 맞춰 다시 그린다 — 기능은 바뀌지 않는다.
>
> 작성 2026-08-15 · 기준 커밋 `main` · 문자열 원본 `map/mobile/www/strings.js`

---

## 0. 시안을 만들기 전에 알아야 할 다섯 가지

### ① 차트는 **영역만** 잡아주면 된다

리포트와 온보딩 1단계의 차트는 `<canvas>` 에 코드로 그린다. CSS 가 닿지 않으므로 **시안에서는 사각형 영역과
위치·크기만 지정**하면 된다. 그 안은 우리가 만든 차트가 그대로 들어간다.

- 필요한 것: 영역의 위치, 폭(보통 화면 전폭), 높이, 위아래 여백
- 필요 없는 것: 캔들 모양, 격자, 축 눈금, 예측선 스타일 — 전부 코드가 그린다
- 색만 값(헥스)으로 주면 코드 쪽에 반영한다. 나눌 단위: 캔들 상승/하락 · 예측선 · 예측 콘 · 격자 · 축 글자
- 차트 위에 겹치는 요소(레전드 행·배지)는 **캔버스 밖 DOM** 이므로 시안에서 스타일을 정해도 된다

### ② 빌드 도구가 없다

`style.css` 한 장 + 순수 JavaScript(ES5)뿐이다. **순수 CSS 면 무엇이든 되지만**, Tailwind 클래스나
컴포넌트 프레임워크 형태로 오면 손으로 풀어야 해서 정확도가 떨어진다. CSS 로 주는 것이 가장 좋고,
안 되면 이미지 + 치수 표기도 괜찮다.

### ③ 폰트는 파일이 필요하다

지금 `Pretendard` 를 지정하지만 **번들에 폰트 파일이 없다.** 앱은 오프라인 번들이라 CDN 을 못 쓰므로
실기기에서는 시스템 폰트로 떨어진다. 특정 폰트를 쓰려면 `.woff2` 를 함께 줘야 하고, 아니면 시스템 폰트
기준으로 시안을 잡는 편이 정확하다.

숫자는 지금 `tabular-nums`(고정폭 숫자)로 자릿수를 맞춘다. 가격·퍼센트가 갱신될 때 흔들리지 않게 하는
장치이므로 **이 성질은 유지**하는 것이 좋다.

### ④ 상단·하단 안전영역

상태바(시계·배터리)와 제스처 바 영역이 있다. 2026-08-15 에 헤더가 상태바에 가려지는 문제가 실기기에서
발견됐다 — 시안에 그 여백이 반영돼 있으면 좋다. 현재 값은 기기가 알려주는 값을 그대로 쓴다.

### ⑤ 요소가 **없을 수도 있는** 화면

서버 설정에 따라 통째로 사라지는 요소가 있다(로그인 행, 광고 행). 그 상태에서도 화면이 어색하지 않아야
하므로, 가능하면 **요소가 빠진 버전**도 함께 봐주면 좋다. 각 요소의 조건은 아래 각 화면에 적었다.

---

## 1. 앱 전체 구조

```
첫 실행 ─────────────▶ 온보딩 5단계 ──▶ 완료
                                        │
재실행 ─────────────────────────────────┤
                                        ▼
                              ┌──── 워치리스트 (홈)
                              │        │  종목 탭
                              │        ▼
                              │     리포트  ── 단계 선택 시트 ──▶ 분석 실행
                              │        │
                              └──── 지갑 (상단 스쿱 필 탭)
```

**하단 탭바가 없다.** 화면 전환은 워치리스트 행 탭(→리포트), 뒤로 버튼, 헤더의 스쿱 필 탭(→지갑)으로
이뤄진다. 시안에서 탭바를 도입하려면 그것 자체가 구조 변경이므로 별도로 알려주면 좋다.

**폴드 펼침 2단** — 화면이 충분히 넓으면(실측 749×654) 좌 목록 255px + 우 리포트로 갈린다.
접으면 다시 1단으로 돌아온다. 두 모드 모두 시안이 있으면 좋다.

**스쿱(Scoops)** — 앱 안의 소비 재화. 분석을 돌리면 차감되고, 출석·광고로 번다. 상한 20.

---

## 2. 온보딩 (5단계) — 첫 실행에 한 번

전체 화면. 하단에 `Back` / `Continue`, 상단에 5칸 진행 표시(활성 칸만 강조).

### 1단계 — 콜드 오픈

| 요소 | 내용 |
|---|---|
| 오버라인 | `Example series` |
| 헤드라인 | `Where does this chart go next?` |
| **차트 영역** | 전폭 · 높이 약 250 (예시 시계로 실제 엔진이 그린 차트 + 예측선) |
| 캡션 | `Every reading below comes from this chart — nothing is hand-written.` |

### 2단계 — 작동 원리

| 요소 | 내용 |
|---|---|
| 헤드라인 | `Thirty readings, one verdict.` |
| **지표 빗** | 막대 30개. 중앙선 기준 위(상승)/아래(하락), 길이가 세기 |
| 캡션 | `30 readings with a direction` |
| 설명 | `Each bar is one indicator. They collapse into a single call.` |

### 3단계 — 왜 무료인가 + 개설 지급

| 요소 | 내용 |
|---|---|
| 헤드라인 | `Why it is free` |
| 설명 | `Deep analysis costs Scoops. You earn them by checking in — and later by watching a short ad.` |
| 가격표 | `Deep analysis` / `Watchlist scan` / `Extra ticker slot` + 각 스쿱 수 |
| 지급 상태 | 진행 중 `Setting up your wallet…` → 성공 `5 Scoops to start` |
| 실패 시 | `We could not reach the wallet. You can continue — Basic reports are always free.` + `Try again` |

**상태 3종**(진행 중 / 성공 / 실패)이 모두 필요하다. 실패해도 다음 단계로 갈 수 있다.

### 4단계 — 첫 종목 고르기

| 요소 | 내용 |
|---|---|
| 헤드라인 | `Pick your first tickers` |
| 설명 | `Three slots to start. You can change them any time.` |
| **종목 그리드** | 12종 큐레이션(심볼 + 회사명). 선택 시 강조 |
| 직접 입력 | `Symbol (e.g. TSLA)` + `Add` 버튼 |
| 상태 문구 | `Checking…` / `We could not find that symbol.` / `Did you mean: ` + 후보 / `That is all the slots for now.` |

**잠긴 셀** — 기존 사용자가 온보딩을 다시 보는 경우, 이미 워치리스트에 있는 종목은 해제할 수 없다.
누르면 `This one is already in your watchlist and stays there.` 잠긴 상태의 시각 구분이 필요하다.

최소 1개를 골라야 다음으로 갈 수 있다(그전까지 `Continue` 비활성).

### 5단계 — 위험 고지 + 약관

| 요소 | 내용 |
|---|---|
| 헤드라인 | `Before you start` |
| 본문 | `MoneyScoop reads price, volume and time. It does not know company news, earnings or anything a person told you. Nothing here is investment advice, and a forecast is not a promise.` |
| 체크박스 | `I understand and accept the terms.` (필수) |
| 마무리 | `Your first deep analysis is free.` |
| 버튼 | `Start` (체크 전 비활성) |

---

## 3. 워치리스트 (홈)

### 헤더

- 워드마크 `Money` + `Scoop`(뒷조각만 강조색) · 15px/700 · 좌측 마크 글리프
- 우측: **스쿱 필**(현재 잔량, 탭하면 지갑) · **스캔 버튼** `↻`

### 상단 고정 툴바 (스크롤해도 붙어 있음)

- 검색창 — `Search ticker or company`
- 그룹 칩 — `All` / `US` / `KR` / `ETF` (활성 칩 강조)

### 종목 행 (높이 64)

좌→우: **신호등 점**(상승/하락/중립, 선택된 행만 링) · **심볼 + 회사명**(74px) · **스파크라인**(64×20) ·
**가격 + 등락률**(우측 정렬, 고정폭 숫자) · **확신 배지**(52px, 예: `68%`)

행 탭 → 리포트. 롱프레스 → 삭제 확인 `AAPL — remove from watchlist?`

### 하단

- `＋ Add ticker` — 전폭 48px 아웃라인 버튼
- 탭하면 **하단 시트**(`Add a ticker`)가 열리고 4단계와 같은 종목 그리드가 나온다

### 상태

| 상태 | 문구 |
|---|---|
| 비어 있음 | `No tickers yet.` / `Add one to get started.` |
| 검색·칩 결과 없음 | `No tickers match.` |
| 스캔 중 | `Scanning AAPL` (진행 표시) |
| 스캔 실패 | `Scan failed` |
| 스캔 결과 없음 | `Nothing could be scanned — your Scoops were returned.` |

---

## 4. 리포트 — 가장 큰 화면

종목 하나의 분석 결과. **Basic(무료·5지표)** 과 **Full(3스쿱·32지표)** 이 같은 화면을 쓰되 Full 에만
나오는 섹션이 있다.

### 헤더

`← Back` · 심볼 · 현재가/시각 · 우측 스쿱 필

### 섹션 순서 (오버라인 = 섹션 머리, 대문자)

| # | 오버라인 | 내용 | 티어 |
|---|---|---|---|
| 1 | `COMPOSITE · DAILY` | **판정 헤드라인** — `Bullish` / `Bearish` + 확신 % · `24 of 30 agree with this direction` | 공통 |
| 2 | — | **차트 영역** (전폭 · 높이 약 520 단독 / 320–460 2단) | 공통 |
| 3 | — | **레전드 행** — `1st forecast` · `Target` · 크로스/스퀴즈 표기 | 공통 |
| 4 | `HORIZON` | **지평 3카드** — `Tomorrow` / `In 1 week` / `In 1 month` · 각 방향·확률·목표범위. 머리 캡션 `288 – 346 · 80% cone` | 공통 |
| 5 | `SIGNALS` | 지표 신호 목록 · `5 of 12 shown` | 공통 |
| 6 | `NOT CHECKED AT THIS LEVEL` | **Basic 의 결핍 4줄** — 적중률·반대 지표·주기 합의·판독 이유가 각각 `—` | **Basic 전용** |
| 7 | `REASONING · 32 NODES` | **지표별 판독문** — 각 지표가 무엇을 보고 그 방향을 냈는지 영어 한 줄씩. 캡션 `daily · 30 with a direction` | **Full 전용** |
| 8 | `AGAINST THIS CALL` | **반대 의견** — 판정과 반대 방향인 지표들. 없으면 `No indicator argues the other way.` | **Full 전용** |
| 9 | — | **적중 이력** — `Bullish calls, measured: 58% right · 42% wrong` + 범위 주석 | **Full 전용** |
| 10 | `TIMEFRAME` | **주기 행** — `Daily` / `Weekly` / `Monthly` · `2 of 3 timeframes agree`. Basic 은 Weekly·Monthly 가 `Locked` | 공통 |

### 티어 배지

- `BASIC` · `5 indicators`
- `FULL` · `32 indicators · daily, weekly, monthly`

### Basic → Full 유도

`Go deeper` 버튼 → **단계 선택 시트**(§5)

### 상태

| 상태 | 문구 |
|---|---|
| 로딩 | (스켈레톤 또는 스피너 — 시안에서 정해주면 좋다) |
| 실패 | `Could not load this report` + `Try again` |
| 봉 부족 | `not enough bars` |
| 2단에서 미선택 | `Pick a ticker on the left.` |

### 판독문 거절 사유 3종 (§7 섹션 안)

`Not enough bars to read` / `No volume data for this ticker` / `No swings large enough to read structure`

---

## 5. 단계 선택 시트 (하단 시트)

리포트에서 `Go deeper` 를 누르면 올라온다.

| 행 | 부제 | 우측 | 비용 |
|---|---|---|---|
| `Basic` | `5 indicators · daily only` | `Free · done` | 0 |
| `Full` | `All 32 indicators · daily, weekly, monthly` | `32 · D·W·M` · `POPULAR` 배지 | 3 |
| `Custom` | `All 32 + your weights` | `Coming soon` (비활성) | 5 |

선택 아래 한 줄: `Costs 3 Scoops` → 실행 버튼 `Run 3 Scoops`

| 상태 | 문구 |
|---|---|
| 실행 중 | `Running…` |
| 잔량 부족 | `Not enough Scoops. Come back tomorrow for +1.` |
| 실패(환불됨) | `Analysis failed — your Scoops were returned.` |
| 실패(환불 미확인) | `Analysis failed. We could not confirm your Scoops were returned — please check your balance.` |
| 지갑 접속 불가 | `Wallet unavailable. Check your connection and try again.` |

**Custom 은 비활성 상태로만 존재한다** — 뒤에서 설명한다(§8).

---

## 6. 지갑 — 가장 많이 늘어날 화면

현재 구조 + **곧 추가될 것**을 함께 적는다. 시안에서 두 상태를 모두 잡아주면 좋다.

### 상단

- `← Back` · 제목 `Scoops`
- **잔량** — 큰 숫자 + `in wallet` + `Cap 20`

### `EARN` 섹션 (오버라인)

| 행 | 부제 | 상태 |
|---|---|---|
| `Daily check-in` | `one tap, once a day` | 받으면 `Day 5 · claimed today` |
| `Week 7 chest` | `3 days away` | 7일 연속 시 +5 |
| **`Quick ad`** ⟵ 추가 예정 | `15 seconds · no skip` | +1 |
| **`Full ad`** ⟵ 추가 예정 | `30 seconds · skip after 5s` | +3 |

**광고 행의 상태 4종** (전부 시안 필요):

1. 평상시 — 두 줄 모두 누를 수 있음
2. 일 상한(8회) 도달 — 두 줄 대신 한 줄 안내
3. 쿨다운(2분) 중 — 남은 시간 표시
4. 광고 직후 — `적립하는 중…` → 성공(잔량 갱신) 또는 `잠시 후 반영됩니다`

> **광고 지급은 즉시가 아니다.** 광고를 다 봐도 구글이 우리 서버에 알려줄 때까지 몇 초 걸리고,
> 안 올 수도 있다. 그래서 잔량을 미리 올려놓지 않고 "적립하는 중" 으로 기다린다 —
> **잔량이 줄어드는 순간을 만들지 않는 것**이 이 화면의 원칙이다.

### `SPEND` 섹션 (오버라인)

| 행 | 비용 | 상태 |
|---|---|---|
| `Deep analysis` | 3 | |
| `Watchlist signal scan` | 2 | |
| `Add a ticker slot` | 1 | 아직 호출부 없음(§8) |
| `Parameter optimiser` | 5 | `Soon` |

### 계정 섹션

| 요소 | 조건 |
|---|---|
| `Sign in with Google` | 서버에 자격증명이 있을 때만 |
| `Sign in is not available right now.` | 자격증명이 없을 때 — **오늘 모든 사용자의 기본 상태** |
| `Sign out` | 로그인 상태 |
| `This device is already linked to a different Google account. …` | 종결 상태 |
| `Keeps your Scoops if you reinstall or change phones.` | 로그인 행 아래 설명 |
| `Your ticker list stays on this device.` | 동기화 범위 고지 |

### 추가 예정

| 요소 | 조건 |
|---|---|
| **`Ad settings`** | EEA·영국·캐나다에서만 보임. 한국에서는 **행 자체가 없다** |
| **현금 가치 없음 고지** | 상시 표기 · 스토어 심사 항목 · 대략 `Scoops have no cash value and cannot be transferred or refunded.` |

### 상태

| 상태 | 문구 |
|---|---|
| 지갑 못 읽음 | `Wallet unavailable — check your connection.` |
| 상한 초과 지급 | `Cap reached — the rest was discarded` |
| 병합된 기기 | `This device's wallet was merged into a Google account — sign in again to reach that account's balance.` |

---

## 7. 잔량 부족 순간 (추가 예정)

리포트에서 Full 을 누르려는데 잔량이 모자라면 **그 자리에서** 광고를 권한다. 지갑 화면으로 튕기지 않고,
광고를 보고 잔량이 차면 **원래 하려던 분석으로 이어진다.**

시안에 필요한 것: 단계 선택 시트 안(또는 그 자리)의 광고 권유 블록 — 문구 + 광고 버튼 + 취소 경로.

---

## 8. 아직 없고, 계획에도 없는 것 — 시안에서 자리만 비워두면 되는 것

| 항목 | 상태 | 시안 지침 |
|---|---|---|
| **Custom 티어**(5스쿱) | 화면엔 있으나 **비활성**. 엔진이 아직 2차 예측선을 만들지 않아 살릴 수 없다 | `Coming soon` 상태로만 그린다 |
| **슬롯 과금** | 가격표에만 있고 실제로 안 받는다 | 행은 그리되 동작은 미정 |
| **비답변 무과금** | 엔진이 판정을 못 내리면 차감을 되돌리는 화면. 미구현 | 필요하면 "판정 없음" 화면을 추가로 그려도 좋다 |
| **설정 화면** | 없다. 광고 설정은 지갑 화면 행으로 대신한다 | 설정 화면을 도입하려면 별도 논의 |
| **하단 탭바** | 없다 | 도입은 구조 변경이므로 별도 논의 |
| **라이트 모드** | 없다(다크 단독) | 도입 시 차트 색도 함께 정해줘야 한다 |
| **언어 전환** | 없다(영어 단독) | 온보딩 시안의 언어 칩은 넣지 않았다 |

---

## 9. 공통 컴포넌트

| 컴포넌트 | 현재 |
|---|---|
| 버튼 | 주요(채움) · 고스트(아웃라인) · 행 탭(전폭 투명) · 최소 높이 44 |
| 하단 시트 | 스크림 + 상단 라운드 · 최대 높이 82vh · 하단 안전영역 반영 |
| 오버라인 | 섹션 머리 · 대문자 · 작은 글자 |
| 배지 | 확신 %(상승/하락/중립 3색) · `POPULAR` · `BASIC`/`FULL` |
| 칩 | 그룹 필터 · 활성/비활성 |
| 빈 상태 | 중앙 정렬 텍스트 · 40px 상하 여백 |
| 토스트 | (현재 최소 구현) |

**금지 사항 하나** — 항목 좌측의 세로 컬러 라인(accent bar/rail)은 쓰지 않는다. 선택·활성 표시는
배경색·텍스트색·체크·아웃라인으로만 한다. 프로젝트 전반 규칙이다.

---

## 10. 시안과 함께 주면 정확도가 올라가는 것

1. **토큰 목록** — 색·간격·라운드·폰트 크기. 현재도 `:root` 토큰으로 잡혀 있어 그 자리에 갈아끼운다
2. **상태별 시안** — 빈 목록·로딩·오류·잔량 0·요소가 숨은 버전
3. **차트 색** — 캔들 상승/하락 · 예측선 · 콘 · 격자 · 축 글자 (헥스)
4. **2단(폴드 펼침) 시안** — 좌 255px 목록 + 우 리포트
5. **여백 규칙** — 화면 좌우 기본 여백, 섹션 간 간격, 안전영역 처리

---

## 부록 — 현재 화면 파일과 대응

| 화면 | 파일 |
|---|---|
| 온보딩 | `www/screens/onboarding.js` |
| 워치리스트 | `www/screens/watchlist.js` |
| 리포트 | `www/screens/report.js` |
| 지갑 | `www/screens/wallet.js` |
| 종목 고르기(공용) | `www/ticker-picker.js` |
| 문구 전체 | `www/strings.js` ← **문구를 바꾸려면 여기만 고치면 된다** |
| 스타일 전체 | `www/style.css` ← **한 장뿐** |

차트 관련(시안에서 영역만 잡으면 되는 것): `chart-layout.js` · `chart-draw.js` · `chart-zoom.js` ·
`draw-layers.js` · `draw-panels.js` · `chart-legend.js`
