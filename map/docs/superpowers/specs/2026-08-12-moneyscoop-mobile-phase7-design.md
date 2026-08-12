# 머니스쿱 모바일 Phase 7 — 워치리스트 시안 재작업

- 날짜: 2026-08-12
- 대상: `map/mobile/www/watchlist-model.js`(신규) · `screens/watchlist.js` · `store.js` · `strings.js` · `style.css` · `index.html`
- 선행: [`2026-08-11-moneyscoop-mobile-phase6-design.md`](2026-08-11-moneyscoop-mobile-phase6-design.md) · 대조 근거 [`../../../mobile/docs/design-audit.md`](../../../mobile/docs/design-audit.md)
- 시안 출처: `mobile/docs/design_handoff/` — 목업 `1a`, 핸드오프 `README.md` §디자인 토큰 · §타이포그래피 · §2 Watchlist
- 상태: 설계 승인됨 (2026-08-12)

## 1. 배경 — 시안이 스스로 "재작업 필요"라 표시한 유일한 화면

핸드오프 README §2:

> **Watchlist `#1a` — ⚠ needs a redraw in the turn-2 type system**
> **Open work:** `#1a` was drawn in the first, pre-refinement pass. Re-render it with the tokens above (hairline dividers instead of card borders, tabular numerals, the corrected greys) before implementing.

즉 **1a의 인라인 스타일을 그대로 옮기면 안 된다.** 1a는 옛 팔레트(`#0b0f14` 배경 · `#46c28e` bull · `#5d667f` 회색)로 그려졌고, 그것이 "재작업"의 대상이다.

**시안은 두 문서다** — 목업 `1a`(레이아웃·치수)와 README(색·타이포·대비 규칙). 이번 작업은 **1a의 기하를 README 토큰으로 다시 그리는 것**이다.

### 1.1 토큰은 이미 맞다

`mobile/www/style.css` 의 `:root` 가 README §디자인 토큰 표와 **한 글자도 다르지 않다** — `--bg:#0a0d12` · `--ink:#eef1f7` · `--ink-5:#78819a` · `--bull:#4fb98a` · `--bear:#d96a6a` · `--bear-text:#e08a8a` · `--steel` · `--platinum` · `--neutral` · hairline 3종. Phase 3이 맞춰 뒀다.

**그래서 이번 작업은 색을 바꾸는 일이 아니라, 빠진 구조를 넣고 1a의 치수를 맞추는 일이다.** 추가하는 토큰은 배지 틴트 둘뿐이다.

## 2. 시안 1a 실측 → 구현 매핑

목업 1a 의 인라인 스타일에서 뽑은 값이다. **치수·기하는 그대로, 색만 토큰으로.**

### 2.1 헤더 — 현 구현과 완전히 다르다

```
◆ MoneyScoop                    ( ● Scan )
```

| 요소 | 시안 1a | 현 구현 |
|---|---|---|
| 로고 마크 | 22×22 · **골드** | 없음 |
| 워드마크 | **15px / 700 / -.01em** | `overline "MONEYSCOOP"` + `25px/600` 타이틀 |
| Scan | **아웃라인 pill** — `padding:5px 9px` · `radius:99px` · `11px` · 6px 초록 점 | 골드 배경 버튼(`.btn-primary`) |
| 하단 | `border-bottom` 1px | 없음 |

시안엔 overline 도 큰 타이틀도 없다. 브랜드 한 줄이 그 자리를 대신한다.

### 2.2 검색창

`height:38px` · `padding:0 12px` · `radius:9px` · 아이콘 15px · 배경 `--sheet` · 보더 `--border` · 플레이스홀더 `--ink-5`.

**38px 는 이 프로젝트의 터치 대상 최소 44px(`.btn`·`.rp-back`) 보다 작다.** 시안 값을 따른다 — 사용자 지시가 "최대한 시안대로"다. 실기기에서 누르기 불편하면 그때 판단한다(§9).

### 2.3 그룹 칩

`padding:6px 11px` · `radius:99px` · `11.5px`

- **활성 = 골드 배경 + `--gold-ink` 텍스트 + 700**
- 비활성 = `--sheet` 배경 + `--border` 보더 + `--steel` 텍스트

> **삼색 규칙과의 충돌을 기록해 둔다.** README §삼색 체계는 *"Steel = Basic 티어. 골드는 Basic 화면에 **0번** 등장한다"* 인데 1a 의 활성 칩은 골드다. 같은 README 가 Basic 리포트에는 *"gold current-price tag"* · *"cone fill at 9% gold"* 를 지시하므로 이 규칙은 문자 그대로 지켜지고 있지 않다. **사용자 지시에 따라 목업을 따른다.**

### 2.4 행 (64px)

| 요소 | 시안 1a | 현 구현 |
|---|---|---|
| 신호등 | **8px + 글로우 링** `0 0 0 3px` 방향색 14% | 7px, 링 없음 |
| 심볼 칸 | **고정 74px** | `flex:1` |
| 심볼 | 14px / 700 / -.01em | 13.5px / 600 |
| 회사명 | 10.5px · `margin-top:2px` | 11px |
| 스파크라인 | 64×20 | 동일 ✅ |
| 가격 칸 | `flex:1` 우측정렬 | 동일 ✅ |
| 가격 | 14px / 600 / **monospace** | 13px / 600 / Pretendard |
| 등락 | 11px / **monospace** · `margin-top:2px` | 11px / Pretendard |
| **확신** | **배지** — 52px 칸 · `padding:3px 6px` · `radius:4px` · 10px / 700 · 방향 틴트 | 회색 텍스트 `4/5` |

### 2.5 색만 바꾸는 곳 (README "corrected greys")

| 1a 옛 값 | 대체 | 이유 |
|---|---|---|
| `#5d667f` (회사명·플레이스홀더) | **`--ink-5 #78819a`** | `#5d667f` 는 대비 하한 미달. README: *"#78819a 가 허용되는 가장 밝은 회색. 설계 중 두 번 고쳤다 — 되돌리지 말 것"* |
| `#46c28e` bull | `--bull #4fb98a` | 모바일 세트는 muted 로 조정된 값 |
| `#222b3d` 보더 | `--border` | |
| `#161c2b` 구분선 | `--hairline` | |
| `#121724` 검색 배경 | `--sheet #11151d` | |
| **행 배경 `#101623`** | **제거** | README 가 지시한 *"hairline dividers instead of card borders"* 가 정확히 이것 |

배지 틴트는 새 토큰 둘로 둔다 — `--bull-soft` · `--bear-soft`. Phase 5의 `--gold-soft` 와 같은 방식이다.

## 3. 시안대로 못 하는 것 둘

### 3.1 그룹 칩의 섹터 분류 → 시장/지역으로 대체

목업은 `All 8` · `US Tech` · `Semis` · `KR` 이다. **`US Tech`·`Semis` 는 섹터인데 앱에 섹터 데이터가 없다.** 10a 가 못박은 포지션이 *"Price. Volume. Time. That is the entire input… no company research, no regional data deals"* 다. 섹터를 넣으려면 그 포지션을 깨거나 사용자가 직접 그룹을 만들어야 한다.

**칩의 자리·모양·동작은 시안 그대로 두고 라벨만 데이터가 있는 축으로 바꾼다:**

```
All 6 · US · KR · ETF
```

판별은 심볼만으로 한다 — 6자리 숫자면 `KR`(`005930`), 알려진 ETF 목록에 있으면 `ETF`(`SPY`·`QQQ`·`VOO`·`VTI`·`IWM`·`DIA`·`VXUS`·`IJR`·`IJH`), 나머지는 `US`. 온보딩 4화면(3b)의 지역 칩이 `US / KR / JP / ETF` 라 시안 안에서 근거가 있다.

**해당 종목이 없는 칩은 그리지 않는다.** KR 종목이 없으면 KR 칩이 없다. `All` 에만 개수를 붙인다(시안이 `All 8` 형태).

### 3.2 우상단 스쿱 필 → 보류

11a 확정 사양의 워치리스트 줄에 *"우상단 스쿱 필 상시"* 가 있으나 **재화 체계가 통째로 미구현이다.** 지금 넣으면 빈 껍데기이거나 거짓 잔량이고, 후자는 8a 가 세운 이 제품의 태도와 정면으로 어긋난다. 재화 페이즈와 함께 온다.

## 4. 확신 배지

값은 `MSReportModel.confidence(ForgeCore, prediction, regime)` — Phase 6 이 만든 것과 **같은 함수**다. 같은 종목의 같은 판정이 두 화면에서 다른 단위로 보이면 안 된다.

**스캔 레코드에 `conf` 를 추가한다.** `watchlist.js` 의 `analyze()` 에 이미 `out`(엔진 결과 전체)이 있으므로 데이터는 그대로 있고, `buildRec` 이 그것을 받아 저장하면 된다.

**값이 없으면 배지를 그리지 않는다.** 옛 스캔 레코드에는 `conf` 가 없다. 회색 자리표시자를 두지 않고 빈칸으로 두며, 다시 스캔하면 채워진다.

### 4.1 신호등과 배지의 방향 기준을 통일한다

현재 신호등 색은 워치리스트 자체 기준(`verdict.score > 8` / `< -8`)이고, 확신은 엔진의 `verdict.regime` 기준이다. **한 행에서 두 기준이 섞이면** 초록 점 옆에 하락 확신이 붙는 조합이 나온다.

`regime` 으로 통일한다 — 리포트 화면이 쓰는 기준이고, 같은 종목이 두 화면에서 다르게 보이지 않는다. `rec.dir` 은 `regime` 에서 파생시킨다.

## 5. 렌더 단위 — 검색창이 스캔에 지워지지 않게

현재 `draw()` 는 **스캔 틱마다 화면 전체를 다시 그린다**(6종목이면 시작 1 + 종목당 6 + 종료 1 = 8회). 여기에 검색창을 넣으면 **스캔 중 타이핑이 날아간다.**

Phase 5가 셸에서 푼 방식과 같게 쪼갠다:

| 단위 | 언제 | 무엇 |
|---|---|---|
| `drawShell()` | 목록 변경 · 최초 · 오타 제안 | 헤더 · 검색창 · 그룹 칩 · 행 컨테이너 |
| `drawRows()` | 스캔 틱 · 검색 입력 · 칩 전환 | 행 컨테이너 내용만 |
| `updateScanBtn()` | 스캔 틱 | 버튼 `textContent` · `disabled` 만 |

검색창이 셸에 있으므로 스캔이 돌아도 포커스·입력값이 유지된다.

## 6. 파일 분해

| 파일 | 변경 | 테스트 |
|---|---|---|
| **`www/watchlist-model.js`** 🆕 | `MSWatchlistModel` — 순수 판별·필터·배지 | ✅ `test/watchlist-model.test.mjs` 🆕 |
| `www/screens/watchlist.js` | 헤더·검색·칩·행 재구성 + 렌더 3단위 + `buildRec` 에 `conf` | 없음(배선) |
| `www/strings.js` | 검색 플레이스홀더 · 칩 라벨 | 기존 문자열 가드 |
| `www/style.css` | 헤더·검색·칩·행·배지 + 틴트 토큰 2개 | 없음 |
| `www/index.html` | 스크립트 태그 1개 | — |

**인터페이스**(엔진처럼 `ForgeCore` 를 인자로 받지 않는다 — 엔진 의존이 없다):

```js
MSWatchlistModel.market(sym)          → "KR" | "ETF" | "US"
MSWatchlistModel.chips(list)          → [{ key, label, count }]   // All 먼저, 빈 칩 없음
MSWatchlistModel.filter(list, opts)   → 걸러진 list               // opts = { chip, query }
MSWatchlistModel.badge(rec)           → { text, tone } | null     // tone = "bull"|"bear"|"neutral"
```

- `chips` 는 모든 칩에 `count` 를 돌려주지만 **화면은 `All` 에만 개수를 붙인다**(시안이 `All 8` 형태). 나머지 개수는 쓰지 않아도 계산이 같은 자리에 있는 편이 낫다.
- `filter` 의 `chip` 이 현재 목록에 없는 시장이면(마지막 KR 종목을 지운 직후 등) **`All` 로 떨어뜨린다.** 빈 화면이 뜨는 것보다 낫고, 셸이 다시 그려지며 그 칩도 사라진다.
- `store.js` 는 **바뀌지 않는다.** `setScan(sym, rec)` 이 스키마 없이 객체를 그대로 저장하므로 `conf` 필드는 `watchlist.js` 의 `buildRec` 만 고치면 된다.

`screens/watchlist.js` 는 220줄 배선 덩어리(스캔 큐·오타 제안·롱프레스 삭제)라 Phase 5에서 일부러 안 건드렸다. 이번엔 손대야 하므로 **판별·필터·배지 규칙을 밖으로 빼서 테스트를 붙인다.** `MSLegend`(Phase 3)·`MSReportModel`(Phase 6)과 같은 패턴이다.

## 7. 테스트

순수 모듈만. 배선은 이 프로젝트 관례상 테스트를 두지 않는다.

- `market` — `"005930"`→`KR` · `"SPY"`→`ETF` · `"NVDA"`→`US` · 소문자 입력 · 빈 문자열·`null`
- `chips` — 없는 시장의 칩은 안 만든다 · `All` 의 개수 · `All` 이 첫 번째
- `filter` — 칩만 · 검색어만 · 둘 다 · 검색은 심볼과 회사명 둘 다 매치 · 대소문자 무시 · 공백만이면 전체
- `badge` — `conf` 없으면 `null` · `conf` 있으면 `"68%"` 형태 · tone 이 방향을 따른다
- **기대값은 리터럴로.** 구현 상수를 읽어 기대값을 만들면 항등식이 된다 — Phase 3·4·5·6에서 네 번 재발했다

관문은 `map/tests/run.sh`. 이번 Phase 는 엔진을 건드리지 않으므로 `forge-core` 259 · `forge-tools` 81 · `landing` 28 은 변동 없어야 한다.

## 8. 범위 밖

- **사용자 정의 그룹** — §3.1
- **스쿱 필** — §3.2, 재화 페이즈와 함께
- **온보딩 5화면** — 별도 페이즈. 시드 종목 자동 주입(`seedIfEmpty`)은 그때까지 유지
- **리포트 화면** — Phase 6 에서 다뤘다
- **`＋ Add ticker` 흐름** — `prompt()` 기반 현행 유지. 시안 3b 의 검색 중심 추가 화면은 온보딩과 함께

## 9. 실기기 확인이 필요한 항목

1. 헤더가 로고 + 워드마크 + 아웃라인 Scan 으로 바뀌고, 골드 버튼이 사라진다
2. 검색창에 입력하면 목록이 좁혀진다 — 심볼·회사명 둘 다
3. **스캔 중에 검색어를 타이핑해도 입력이 날아가지 않는다**(§5 의 이유)
4. 그룹 칩이 보유 종목에 맞게만 뜬다(KR 종목이 없으면 KR 칩 없음)
5. 확신 배지가 방향색으로 뜨고, 스캔 안 한 종목은 빈칸이다
6. **검색창 38px 이 실제로 누르기 불편한지**(§2.2 — 프로젝트 44px 규격보다 작다)
7. 폴드 2단 목록 칸(255px)에서 칩·배지가 깨지지 않는다

## 10. 열린 항목

- **`--gold-soft` 선택 하이라이트(Phase 5)** — 2단에서 선택 행을 골드 틴트로 칠한다. 활성 칩도 골드가 되므로 한 화면에 골드가 둘이 된다. 실기기에서 경쟁하는지 보고 판단
- **`wl-conf` 를 숨기던 2단 CSS** — 확신이 텍스트에서 배지로 바뀌므로 2단 목록 칸(255px)에서 다시 볼 것. 배지는 52px 라 스파크라인(64px)보다 좁아 남길 여지가 있다
- **ETF 목록이 하드코딩** — `SPY`·`QQQ` 등 9종. 목록 밖 ETF 는 `US` 로 분류된다. 티커 메타데이터가 생기면 그때 교체
