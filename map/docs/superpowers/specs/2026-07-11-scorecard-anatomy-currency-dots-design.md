# 스코어카드 엔진 해부도 — 버전·지표·축 자동 현행화 + 데이터량 비례 도트/노드

**날짜**: 2026-07-11
**대상**: `forge-core.js`(엔진 메타 export) · `forge-scorecard.html`(해부도 렌더) · `forge-core.test.js`(export 계약 테스트)

## 배경 / 문제

스코어카드(`forge-scorecard.html`)의 "🫀 분석 엔진 해부도"(라이브 신경망 + 정적 스키매틱)는 엔진 상태를 **수작업 하드코딩**으로 표기한다. 이로 인해:

1. **버전 stale**: footer "스쿱포지 엔진 v1.9.7" 등 현재 버전이 29곳에 문자열로 박혀 있어 엔진 버전이 바뀌면 손으로 고쳐야 한다.
2. **축 누락**: 라이브 신경망 리스크 노드가 5개(변동성·낙폭·이익목표·급변·갭)뿐 — v1.9.5에서 추가된 **추세 지속/소진(6번째 검증 축, `forecastTrendPersist`)이 빠져 있다**. 정적 스키매틱 B2도 "리스크 3축"으로 5개만 나열(문구·목록 stale).
3. **도트 획일**: 라이브 신경망의 흐르는 신호 입자(`flow(path,color,n)`)가 엣지별 `n`을 하드코딩(대부분 1~2)해, "어느 경로가 데이터를 많이 나르는지"가 드러나지 않는다. 뉴런도 전부 동일 크기 원.

## 목표

- 엔진 버전·지표 수·검증 축을 **엔진(`forge-core.js`)이 단일 출처로 export** → 스코어카드가 읽어 자동 현행화. 버전/축 추가 시 스코어카드 수정 불필요.
- 라이브 신경망의 **이동 도트 수량 = 그 엣지가 나르는 데이터 스트림 수에 비례**(집약 채널일수록 도트 多).
- **비중 높은 항목은 노드 크기도 차별화**(균일 원 탈피) — 데이터량 큰 지표군 뉴런을 더 크게.
- 누락된 추세 지속 축을 해부도(라이브·정적) 양쪽에 반영.

비목표(YAGNI): 개선 이력(changelog) 자동 생성(역사·서술 필요 → 수작업 유지), 기능 *도입* 버전 배지(v1.7·v1.9.1 등 역사값) 변경, 라이브 run 기반 실측 도트(도식 성격상 결정적·정적 유지).

## 설계

### A. `forge-core.js` — 엔진 메타 export (단일 출처)

기존 `const version = "1.9.7";` 옆에 추가:

```js
const indicatorCount = 30;   // 지표 배터리 종수 (forge-state IND_TIERS와 동기 — 지표 추가 시 함께 갱신)
// 검증된 예측 축(백테스트 OOS). acc=대표 지평 정확도(%), hz=지평 라벨, stock=주식 한정.
const validatedAxes = [
  { key: "vol",   lab: "변동성 예보",   acc: 69, hz: "3지평" },
  { key: "dd",    lab: "낙폭 위험곡선", acc: 68, hz: "3지평" },
  { key: "up",    lab: "이익목표 도달", acc: 64, hz: "" },
  { key: "spike", lab: "급변 경보",     acc: 65, hz: "3지평" },
  { key: "gap",   lab: "갭 경보",       acc: 63, hz: "3지평", stock: true },
  { key: "trend", lab: "추세 지속/소진", acc: 76, hz: "3지평·비방향" },
];
```

UMD return 객체에 `indicatorCount, validatedAxes` 추가. 순수 데이터·추가 export라 기존 199 테스트 무영향(엔진 계산 불변). acc/hz는 이미 엔진 주석·changelog에 있는 검증 사실을 데이터로 승격(축 정확도의 단일 출처).

### B. `forge-scorecard.html` — 버전·카운트 현행화

`ForgeCore`는 이미 로드됨(`<script src="forge-core.js">`). 스크립트 상단에서 메타를 읽어 상수화:

```js
const EV = (typeof ForgeCore!=="undefined" && ForgeCore.version) ? ForgeCore.version : "1.9.7";
const IND_N = (typeof ForgeCore!=="undefined" && ForgeCore.indicatorCount) || 30;
const AXES = (typeof ForgeCore!=="undefined" && ForgeCore.validatedAxes) || [];
const AXIS_N = AXES.length || 6;
```

치환 지점:
- **footer**(657): `"스쿱포지 엔진 v"+EV+" · 기준 "+BT.asOf+...`
- **정적 스키매틱 A1**(206): `지표 배터리 · ${IND_N}종`
- **정적 스키매틱 B2**(241 근처): 라벨 `리스크 ${AXIS_N}축 · 로지스틱`, 축 나열을 `AXES`에서 생성(추세 지속 자동 포함) — `AXES.map(a=>`<b>${a.lab}</b> ${a.acc?a.acc+"%":""}`).join(" · ")`.
- **라이브 신경망 헤더/aria**(591·625): `${IND_N}개 지표 뉴런`.

`EV` fallback은 ForgeCore 로드 실패(파일 직접 열기 등) 시에도 깨지지 않게 함.

### B2. 라이브 신경망 리스크 노드를 `validatedAxes`에서 생성

기존 하드코딩 `const risk = [5 objects]`를 `AXES`에서 생성:

```js
const RCOL = { gap: "#c98a5a" };   // 주식 게이트 축만 특수색, 나머지 bull
const N = AXES.length;
const RTOP = 398, RBOT = 640, RSTEP = N>1 ? (RBOT-RTOP)/(N-1) : 0;   // 개수에 맞춰 세로 분배
const risk = AXES.map((a,i)=>({ x:706, y: Math.round(RTOP+i*RSTEP), r:11,
  c: a.stock ? RCOL.gap : bull, lab: a.lab, sub: a.acc+"%"+(a.hz?" · "+a.hz:""), pl:"right", ax:a }));
```

- **추세 지속/소진이 6번째 노드로 자동 등장**, 향후 축 추가 시도 세로 간격이 자동 재분배(레이아웃 오버플로 없음, RBOT=640 < 하단 범례 y=H-12=688).
- 피처→리스크 팬 와이어(`FEAT.forEach(f=>risk.forEach(...))`)·`risk→out` 흐름은 생성된 `risk`를 그대로 순회하므로 자동 반영.

### C. 이동 도트 = 데이터 스트림 수 비례 (`flow`)

`flow(d,c,n)` → `flow(d,c,streams)`로 의미 변경, 도트 수 산출:

```js
const DOT_MAX = 5, DOT_K = 0.6;
const dotN = streams => Math.max(1, Math.min(DOT_MAX, Math.round(streams * DOT_K)));
```

엣지별 `streams` 배정(데이터량):
- **지표군 → 드리프트**(대표 흐름): `streams = 군 크기 k` → 모멘텀8·추세7 최다, 주기2 최소.
- **드리프트 → 방향 / 드리프트 → 콘 / 캘리브 → 출력**: `streams = IND_N`(30) → 상한 5(가장 굵은 집약 신호).
- **리스크 → 출력**: `streams = 3`(중간).
- **가격 → 개별 지표·피처 / 피처 → 리스크**(대표): `streams = 1`.

기존 "대표 흐름" 블록(616~618)의 개별 지표 단발 흐름은 유지하되, 지표군→드리프트 흐름을 **군 대표 1줄기 × 군 크기 비례 도트**로 재구성(밀집 팬 위 대역폭 가시화).

### C2. 노드 크기 차별화 (비중)

- **지표 뉴런 반지름 = 군 크기 비례**: `nr = 3.4 + Math.min(6.4, k*0.38)` → 주기(2) 작게, 모멘텀(8) 크게. 글로우 반지름도 비례(`nr+2.7`). 컬럼 간격(17.6px)은 유지, 그리기 반지름 상한으로 과겹침 방지.
- **명명 노드**(드리프트·방향·콘·출력·리스크)는 기존 차등 `r` 유지(이미 out r19 등 차별화됨).
- **범례 문구**(644) 갱신: `뉴런 색 = 지표군 · 크기·도트 = 데이터 비중`.

### 데이터 흐름

`forge-core.js`(메타 상수) → `ForgeCore.{version,indicatorCount,validatedAxes}` → `forge-scorecard.html` 부팅 시 읽어 (a) 버전/카운트 문자열 주입, (b) 리스크 노드 생성, (c) `flow`/뉴런 크기 계산. 런타임 계산·서버 호출 없음(정적 도식).

### 오류 처리

`ForgeCore` 미로드(파일 직접 열기) 시 `EV/IND_N/AXES` fallback으로 기존 하드코딩 값과 동일하게 렌더(그레이스풀). 라이브 신경망은 `AXES`가 비면 fallback 5축 배열 사용.

### 테스트

- `forge-core.test.js`: export 계약 테스트 추가 — `version` 문자열, `indicatorCount===30`, `validatedAxes` 길이 6·각 항목 `{key,lab,acc}` 보유·`trend` 키 포함. (엔진 계산 테스트는 불변 통과.)
- 헤드리스 스모크: 스코어카드 로드 후 페이지 오류 0 + 리스크 노드 6개(추세 지속 포함) 렌더 + footer가 `ForgeCore.version` 반영 확인.

## 변경 파일

| 파일 | 변경 |
|---|---|
| `forge-core.js` | `indicatorCount`·`validatedAxes` 상수 + export 추가(순수 데이터) |
| `forge-scorecard.html` | 버전/카운트 동적화, 리스크 노드 생성, `flow` 스트림 비례 도트, 뉴런 크기 차등, 정적 스키매틱 B2 축 목록 갱신, 범례 |
| `forge-core.test.js` | export 계약 테스트 |

배포: `forge-core.js` + `forge-scorecard.html`(정적 페이지). `forge-core.js`는 메인 앱 공용이나 추가 export뿐이라 하위호환.
