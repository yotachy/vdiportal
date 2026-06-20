# ScoopSignal — 앱셸 사이드바 리디자인 + 35% 스케일 설계

- **날짜:** 2026-06-21
- **대상:** `signal/scoopsignal.html` (단일 파일, 바닐라 JS, 무빌드)
- **목표:** (1) 전체 35% 확대, (2) 주기 패턴을 좌측 사이드바 메뉴(현재값 배지 포함)로 끌어올려 스쿱시그널의 시그니처 데이터로 부각, 탭이 잘 안 보이던 문제 해결.

핵심: **레이아웃/네비게이션 재구성**이며, 점수 산식·데이터 로더·차트 그리기 로직(`drawXxx`)은 그대로 둔다.

---

## 1. 전역 스케일 (35%)

- `html{ zoom:1.35 }` 추가 (브라우저 135% 확대와 동일·균일). 폰트·간격·차트 모두 비례 확대.
- 기존 `.wrap{max-width:1000px}`를 앱셸 컨테이너 `.app`로 교체하고 `max-width:1180px; margin:0 auto`.
- 반응형 `@media`는 비례 유지(아래 §5). `prefers-reduced-motion` 기존 규칙 유지.

## 2. 앱셸 레이아웃

```
body > .app   →  grid-template-columns: 248px 1fr;  gap; max-width:1180px; margin auto
  ├─ aside.side   (position:sticky; top:0; 자체 스크롤 가능)
  └─ main.main
```

### 2.1 사이드바 `aside.side`
- **브랜드:** "스쿱시그널 / ScoopSignal" + 한 줄 태그라인(짧게).
- **갱신 영역:** 업데이트 시각(`#updatedAt`) + 새로고침 버튼(`#refreshBtn`) — 헤더에서 이동.
- **주기 패턴 네비(`.snav`)** — 그룹 2개:
  - `사이클`: 계절성(season) · 사이클 오버레이(cycle) · 반감기(halving)
  - `밸류·리스크`: 로그 밴드(band) · 200주 배수(mayer) · 드로다운(dd) · 변동성(vol)
  - 항목(`.snav-item[data-tab]`) = 라벨 + 현재값 배지(`.snav-badge`). 활성 항목 `.on`(좌측 골드 바 + 배경).
- **하단:** 데이터 소스 상태등 5개(기존 `#st-*` 콤팩트 재배치) + 출처 한 줄(작게).

### 2.2 메인 `main.main` (위→아래)
1. **종합 요약 스트립:** 게이지(`#scoreNum`/needle) + 판정(`#verdictText`/`#verdictRead`) + 티커 3종(ETH/BTC/ETH·BTC).
2. **4축 요약:** 레이더(`#radarG`) + 사이클 시계(`#quadG`) + 4축 카드/칩(축별 점수).
3. **선택한 주기 패턴(대형):** `.charts` 컨테이너 유지하되 **상단 탭 버튼 행(`.tabs`) 제거**. `panel-chart` 패널들은 그대로(사이드바가 활성 전환). 노트 + 캔버스 + 통계 라인.
4. **축별 상세 4카드:** 기존 `.dims`(모멘텀/유동성/펀더멘털/밸류) 유지.
5. **튜닝 패널(`details.tune`) + 방법론(`details.method`) + 푸터** 유지.

> 메인 콘텐츠는 기존 마크업을 최대한 재사용하고 컨테이너만 `.app`/`.main`으로 감싸고 순서를 위와 같이 정리한다. `.hero`(게이지·레이더·quad)·`.dims`·`.charts`·`details`·`footer`는 보존.

## 3. 동작 (네비 ↔ 차트)

- 기존 `activeTab` + `drawActiveChart()`(7키 디스패치) 재사용.
- 신규 `selectPattern(tab)`: `activeTab=tab` → `.snav-item.on` 토글 → `.panel-chart.active` 토글 → `if(S.month)drawActiveChart()`.
- 사이드바 항목 클릭 → `selectPattern(tab)`. 기존 `.tab` 버튼 클릭 핸들러/`.tabs` 행은 제거하고 `.snav-item`으로 대체. **리사이즈 핸들러**는 `activeTab!=='season'`이면 재그림 — 유지.
- 기본 활성 = `season`(계절성).

## 4. 사이드바 현재값 배지

`recompute()` 끝(또는 `refresh` 끝)에서 `updateSideBadges()` 호출. 각 항목 배지 텍스트+색(`--bull/--bear/--muted`):

| data-tab | 배지 산식 | 데이터 |
|---|---|---|
| season | 이번 달 과거 평균 수익률 `±X%` | `S.month`(월별, 현재 달 인덱스 평균) |
| cycle | 바닥(2022-06-18) 후 `N주` | `S.week.t` 인덱스 차 |
| halving | 반감기(2024-04-20) 후 `N주` | `S.week.t` 인덱스 차 |
| band | `z=±X.Xσ` | `S.band.z` |
| mayer | `X.XX×` | `S.ma200.mult` |
| dd | `−X%` (현재 낙폭) | `S.week.c` 누적최고 대비 |
| vol | `X%` (현재 변동성) | `S.week.c` 13주 |

- 데이터 미로드 시 배지는 `—`(muted). 전부 `S` 재사용, 새 fetch 없음.
- 색 규칙(가벼운 호악): dd/vol/band는 음수·고변동·과열일수록 bear, 저평가일수록 bull; season은 +면 bull/−면 bear; cycle/halving/mayer는 muted(중립 정보성).

## 5. 반응형

- 기본(넓은 화면): 248px + 1fr.
- `@media(max-width:920px)`(zoom 후 실제 px 고려): `.app`를 1열로, 사이드바가 **상단**으로 이동. 네비는 가로 스크롤이 아니라 **2~3열 그리드 메뉴**(항목+배지)로 또렷하게(모바일에서도 잘 보이게 — 원래 문제 해결).
- 기존 `.hero`/`.dims` 브레이크포인트는 메인 내부에서 유지.

## 6. 영향 범위

| 위치 | 변경 |
|---|---|
| CSS `:root`/`html` | `zoom:1.35` |
| CSS | `.app`/`.side`/`.snav`/`.snav-item`/`.snav-badge` 신규, `.wrap`→`.app` 치환, `.tabs` 제거(또는 숨김), 반응형 |
| HTML | `<header>`/`<div class="wrap">` 구조를 `.app`(aside+main)로 재편. 사이드바 마크업 신규. 상태등·새로고침·업데이트시각 이동. `.tabs` 행 제거 |
| JS | `selectPattern(tab)` 신규, 사이드바 클릭 바인딩, `updateSideBadges()` 신규(+`recompute`에서 호출). 기존 `.tab` 바인딩 제거 |
| 보존 | `drawHeatmap/drawCycle/drawBand/drawDrawdown/drawHalving/drawVol/drawMayer`, `recompute`, 점수 함수, 게이지/레이더/quad, 데이터 로더, 튜닝/방법론 |

## 7. 제약 (Global Constraints)

- 단일 파일·무의존·무빌드·바닐라 JS. **새 네트워크 fetch 금지**(기존 `S`).
- 디자인 토큰만(색·라운드·폰트는 `:root` 변수/기존 hex 관례). 한국어 UI.
- 점수/게이지/4축/차트 그리기 로직 불변 — 레이아웃·네비·배지만 추가.
- localStorage는 기존 `scoopsignal_cfg`만(튜닝). 활성 탭 영속화는 범위 외(YAGNI, 기본 season).

## 8. 검증 (테스트 러너 없음)

- `node --check` 신택스.
- 헤드리스 렌더(WSL chromium_headless_shell + 추출 lib): 사이드바 7개 항목 표시, 클릭 시 해당 차트 전환(activeTab 강제+`selectPattern` 호출로 스모크), 배지 7개 값 채워짐, 게이지/4축 요약 정상, 콘솔 에러 0. 스크린샷으로 35% 확대·앱셸 레이아웃 육안 확인.
- Binance 차단 시 차트 비고 배지 `—` 되는 디그레이드 유지.

## 9. 배포 (vdi-log 방식)

- 커밋 → push → cafe24 SFTP `www/portal/signal/scoopsignal.html`.

## 10. 비범위 (YAGNI)

- 활성 패턴 localStorage 영속화.
- 사이드바 접기/펼치기 토글.
- 신규 데이터/지표 추가(이번은 레이아웃·네비·배지만).
