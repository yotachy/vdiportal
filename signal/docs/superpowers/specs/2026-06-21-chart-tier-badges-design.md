# 차트 등급(Basic / Signature) 배지 체계 — 설계 문서

- 작성일: 2026-06-21
- 대상 파일: `signal/scoopsignal.html` (단일 정적 HTML 유지)
- 성격: 분류 메타데이터 + 표시(배지) 추가. 데이터/산식 로직 불변, 실제 게이팅 없음.

## 1. 배경 / 목적

크립토시그널의 차트는 두 부류로 나뉜다.

- **Basic** — 어디서나 볼 수 있는 표준 지표(드로다운, 변동성, 200주 배수, 로그 밴드, 반감기/사이클 오버레이, 계절성).
- **Signature** — 크립토시그널이 자체적으로 해석·도출한 지표(현재: 스네일 차트).

향후 이 사이트가 신호 참고용으로 가치가 커지면 **유료 회원제로 데이터 공개 범위를 등급별로 차등화**할 계획이다. 그 토대로, 지금 단계에서 각 차트의 등급을 **눈에 보이게 구분**하고, 분류를 **확장 가능한 단일 출처**로 만들어 둔다. 차트는 앞으로 계속 늘어나므로, 새 차트가 한 줄 등록만으로 자동 분류·배지되는 구조가 핵심이다.

## 2. 목표

- 각 차트에 **Basic / Signature** 등급을 부여하는 **단일 출처 메타데이터**(`CHART_TIER`).
- 차트 페이지 헤더와 사이드바 네비에 등급을 **시각적으로 표시**(배지/마커).
- 등급 의미를 사용자에게 **한 줄로 안내**(향후 유료 차등 암시).
- 새 차트 추가 시 `CHART_TIER`에 한 줄만 추가하면 배지가 자동 적용되는 확장성.

## 3. 비목표 (YAGNI)

- 실제 결제·로그인·회원 등급 시스템.
- 등급별 데이터 차단/블러/잠금 처리.
- 데이터 로더·점수 산식·기존 뷰 라우팅 변경.
- 주제 그룹(사이클 / 밸류·리스크) 재편 — **그대로 유지**.

## 4. 분류 (현재)

| 뷰 key | 차트 | 등급 |
|---|---|---|
| `spiral` | 이더리움 스네일 차트 | **signature** |
| `season` | 계절성 | basic |
| `cycle` | 사이클 오버레이 | basic |
| `halving` | 반감기 | basic |
| `band` | 로그 밴드 | basic |
| `mayer` | 200주 배수 | basic |
| `dd` | 드로다운 | basic |
| `vol` | 변동성 | basic |
| `dashboard` | 이더리움 대시보드(ETH 시그널/레이더/사이클) | **미부여**(랜딩 종합 화면, 추후 조정 가능) |

## 5. 컴포넌트 설계

### 5.1 단일 출처 메타데이터

`<script>`에 추가:
```js
const CHART_TIER = {
  spiral:'signature',
  season:'basic', cycle:'basic', halving:'basic',
  band:'basic', mayer:'basic', dd:'basic', vol:'basic'
  // 새 차트 추가 시 여기 한 줄만 추가 → 배지 자동
};
const TIER_META = {
  signature:{ label:'Signature', title:'크립토시그널이 자체 해석·도출한 지표' },
  basic:    { label:'Basic',     title:'공개적으로 널리 쓰이는 표준 지표' }
};
```
- `dashboard`는 `CHART_TIER`에 **없음** → 배지 미표시(안전: 조회 시 `undefined` → 미부여).
- 이 객체가 향후 유료 게이팅의 단일 스위치 역할(지금은 표시 전용).

### 5.2 배지 렌더링 — 차트 페이지 헤더

각 패턴 뷰의 `.page-head h2` 옆에 등급 배지를 **JS로 주입**(마크업 중복 방지). 뷰 활성화 시점 또는 초기화 시 1회 주입.

- 함수 `applyTierBadges()`: `document.querySelectorAll('.view[data-view]')`를 돌며 `CHART_TIER[key]`가 있으면 해당 `.page-head h2`에 `<span class="tier-badge tier-{tier}" title="{title}">{label}</span>` 추가(이미 있으면 스킵 — 멱등).
- 초기화에서 1회 호출(`applyTierBadges()`). 정적이므로 매 렌더 재주입 불필요.

배지 스타일(디자인 토큰만):
- `.tier-badge` 공통: 11px, 라운드 필, letter-spacing.
- `.tier-signature`: 골드 — `color:var(--ink); background:var(--gold);` + 선행 다이아몬드 글리프(작은 인라인 SVG 또는 `◆`). 프리미엄 느낌.
- `.tier-basic`: 차분 — `color:var(--muted); background:var(--panel-2); border:1px solid var(--line);`.

### 5.3 네비 마커 — Signature만

사이드바 네비에서 **Signature 항목만** 라벨 앞에 작은 골드 점을 표시(Basic은 무표시). 기존 현재값 배지(`.snav-badge`)·주제 그룹은 유지.

- `applyTierBadges()` 내에서 `CHART_TIER[key]==='signature'`인 `.snav-item[data-view=key]`에 `tier-sig` 클래스 부여.
- CSS: `.snav-item.tier-sig::before{content:"";width:5px;height:5px;border-radius:50%;background:var(--gold);...}` (라벨 앞 인라인). 좌측 바 금지 규칙과 무관(점이지 바가 아님). 활성(`.on`) 상태와 공존.

### 5.4 의미 안내

산식(`details.method`) 본문에 한 줄 추가:
> **Basic** = 어디서나 볼 수 있는 표준 지표 · **Signature** = 크립토시그널이 자체 해석·도출한 지표. 향후 데이터 공개 범위가 회원 등급별로 달라질 수 있습니다.

## 6. 데이터/로직 흐름 (불변)

- 데이터 로더·점수 산식·`recompute()`·뷰 라우터(`showView`/`VIEW_DRAW`) 변경 없음.
- `applyTierBadges()`는 DOM 정적 주입만 수행(점수·차트 렌더와 독립). 초기화 1회.

## 7. 확장성 시나리오

- **새 차트 추가**: 뷰 섹션 + `VIEW_DRAW` 등록 + `CHART_TIER`에 `key:'basic'|'signature'` 한 줄 → 배지·네비 마커 자동.
- **향후 유료화**: 회원 상태에 따라 `CHART_TIER[key]==='signature' && !isPaid`이면 해당 뷰를 잠금/블러로 전환하는 게이트를 `showView`에 추가(현재는 미구현). 분류는 그대로 재사용.

## 8. 엣지/주의

- `applyTierBadges()`는 **멱등**(이미 배지가 있으면 재추가 안 함) — 중복 주입 방지.
- `dashboard`처럼 `CHART_TIER`에 없는 키는 안전하게 미부여.
- 디자인 토큰만 사용, `html{zoom:1.35}` 유지, 한국어 UI, 좌측 컬러바 금지 준수(네비 마커는 점).
- 배지가 `.page-head` 레이아웃을 깨지 않도록 제목과 같은 줄 `inline-flex`/`align-items:center`.

## 9. 검증

- 8개 패턴 뷰 중 스네일에만 Signature(골드) 배지 + 네비 골드 점, 나머지 7개에 Basic(회색) 배지.
- 대시보드는 배지 없음.
- 배지 `title` 호버 설명 노출, method 안내문 추가 확인.
- 데이터/점수/차트 렌더 회귀 없음(헤드리스 JS 에러 0, 차트 정상).
- `applyTierBadges()` 2회 호출해도 배지 1개만(멱등) — 콘솔/DOM 확인.
