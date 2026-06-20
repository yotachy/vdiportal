# ScoopSignal — 로드맵 항목 4·5·6 설계

- **날짜:** 2026-06-20
- **대상:** `signal/scoopsignal.html` (단일 파일, 바닐라 JS, 무의존)
- **범위:** CLAUDE.md §11 로드맵의 항목 4·5·6

| # | 기능 | 결정 |
|---|---|---|
| 4 | 스테이킹 APR − 10Y 스프레드 | **펀더멘털 축에 편입** (고정 lerp 임계값) |
| 5 | L2 TVL 점수 승격 | **주요 L2 3개(Arbitrum·Base·OP Mainnet) 히스토리 합산** |
| 6 | 튜닝 패널 | **가중치 + 핵심 파라미터, localStorage 저장** |

> **CLAUDE.md 갱신 필요:** §10이 "localStorage 미사용"으로 적혀 있으나 항목6에서 저장을 채택. 구현 시 CLAUDE.md(§4 상태 흐름·§10 설정값·§11 로드맵 체크)도 함께 갱신한다.

---

## 1. 아키텍처 — 설정 분리 + `recompute()` 도입

현재 `refresh()`는 *fetch → 점수 → 렌더*가 한 덩어리다. 항목6(튜닝)은 가중치·ROC기간·σ폭을 바꿀 때 **재fetch 없이** 즉시 다시 계산해야 한다. 따라서 분리한다.

```
refresh()    : 네트워크 fetch(Promise.allSettled) → S에 적재 → recompute()
recompute()  : 캐시된 S + 전역 CFG로 점수 계산 + 렌더 (네트워크 없음)
CFG          : localStorage("scoopsignal_cfg")에서 로드, DEFAULTS에 머지
```

- **튜닝 변경 시 흐름:** UI 변경 → `CFG` 갱신 → localStorage 저장 → `recompute()` 호출 (σ폭만 바뀐 경우 밴드 차트만 재렌더).
- **단일 파일·무의존·그레이스풀 디그레이드 원칙 유지.** 신규 fetch 전부 `try/catch`로 한 곳 실패가 전체를 깨지 않게.

### 대안 비교 (기각)
- **B안 매번 재fetch:** 슬라이더 1회당 API 5~8개 재호출 → 느리고 레이트리밋 위험. ✗
- **C안 파일 분리(css/js):** 단일 파일 배포 단순함 위배. ✗

---

## 2. 전역 `CFG` 구조

```js
const CFG_KEY = "scoopsignal_cfg";
const CFG_DEFAULTS = {
  w:        { liq:0.30, mom:0.25, fun:0.25, val:0.20 }, // 종합 가중치 (사용 시 합=1로 정규화)
  rocMonths: 3,                                          // 모멘텀 ROC 기간(개월), 1~6
  bandSigma: { s1:1, s2:2 }                              // 밴드 회귀 채널 σ 배수(표시용)
};
// 로드: DEFAULTS에 localStorage 값을 깊은 머지(키 누락/구버전 안전)
// 저장: 변경 시마다 JSON.stringify로 저장
// 리셋: CFG = clone(DEFAULTS) + 저장 + recompute()
```

가중치 슬라이더는 0~100 정수로 받고, 사용 시점에 `w_i / Σw`로 정규화한다(합이 100이 아니어도 안전).

---

## 3. 항목 4 — 스테이킹 APR − 10Y 스프레드

### 데이터
- `loadBeacon`에 ETH.STORE APR 추가: `S.staking = { apr, fb }`.
  - 엔드포인트 후보: `https://beaconcha.in/api/v1/ethstore/latest` (APR 필드 방어적 파싱).
  - 실패/CORS 차단 시 `apr = 3.0`, `fb = true` (검증자 큐와 동일한 best-effort).
- `loadFred`에 명목 10Y `DGS10` 추가: `S.tenY = { val, fb }`.
  - 프록시 미연결 시 `val = 4.3`, `fb = true` (기존 FRED fallback 패턴 확장).

### 스코어
- `spread = S.staking.apr − S.tenY.val` (단위: %p).
- 히스토리 확보가 어려워(두 소스 모두 best-effort) **고정 lerp 임계값** 사용(유동성 축 방식):
  ```
  spreadS = lerp([[-3,15],[-1,35],[0,50],[1.5,70],[3,88]], spread)
  ```
  스프레드 클수록(ETH 이자 매력↑) 가점.
- 펀더멘털 parts에 `spreadS` 편입.

### 표시
- 펀더멘털 카드(`#cFun`)에 행 추가: `스테이킹−10Y` / 값 `+X.Xp%` (+ `예시` 배지 when `fb`).
- 상태바(`#status`)의 "스테이킹" 표시등은 staking+tenY 가용성 반영.
- 방법론(method) 본문에 한 줄 추가.

---

## 4. 항목 5 — L2 TVL 점수 승격

### 데이터
- `loadLlama`에 L2 히스토리 3개 추가 fetch:
  - `https://api.llama.fi/v2/historicalChainTvl/Arbitrum`
  - `https://api.llama.fi/v2/historicalChainTvl/Base`
  - `https://api.llama.fi/v2/historicalChainTvl/OP%20Mainnet` (체인 슬러그는 구현 시 검증; 실패 체인은 건너뛰고 가용분만 합산)
- 날짜 정렬 후 합산 → `S.l2 = { now, series, chg30, hist }`.
  - `chg30 = pctChange(series,30)`, `hist = rollChanges(series,30)`.
  - 매 60초 refresh마다 fetch (사용자 선택: 캐시 아닌 "주요 3~4개만").

### 스코어
- `l2p = pctRank(S.l2.hist, S.l2.chg30)` → 펀더멘털 parts에 `l2p*100` 편입(TVL·스테이블과 동일 방식).

### 표시
- 기존 `l2Val` 행을 표시 전용 → 점수형으로: `$X.XB` + 30d 증감 + 분위 막대(`prMeter`).

### 펀더멘털 종합
- 가용 항목 **평균** 유지: `[TVL, 스테이블, L2, 스프레드, 검증자큐]` 중 가용분 mean.
- 하위 가중치 분리는 범위 외(YAGNI).

---

## 5. 항목 6 — 튜닝 패널

### UI
- 방법론(`details.method`)과 같은 스타일의 접이식 `튜닝` 패널을 방법론 **위**에 배치.
- 컨트롤:
  - 4축 가중치 슬라이더(유동성/모멘텀/펀더멘털/밸류) — 옆에 정규화 % 표기.
  - ROC 기간 컨트롤(1~6개월).
  - 밴드 σ폭(±1σ·±2σ 배수, 0.5 step).
  - **리셋** 버튼(기본값 복원).
- 디자인 토큰만 사용, 한국어 라벨.

### 동작
- 컨트롤 변경 → `CFG` 갱신 → localStorage 저장 → `recompute()`.
  - σ폭만 바뀐 경우 `drawBand()`만 재실행(점수 불변).
- 페이지 재로딩 시 저장된 `CFG` 복원.

### 반영 지점
- **종합 점수:** `refresh()`/`recompute()`의 `score=` 라인이 `CFG.w`(정규화)를 사용.
- **ROC 기간:** `scoreMom` 또는 `recompute`가 원본 `S.month.c`에서 `S.roc = {now:pctChange(mc,k), hist:rollChanges(mc,k)}` 재계산 (k=`CFG.rocMonths`). → 원본 월간 종가 `S.month.c`는 그대로 보존.
- **σ폭:** `drawBand`가 `CFG.bandSigma.s1/s2`로 채널 그림(현재 하드코딩된 1·2 대체). 점수(`scoreVal`의 잔차 백분위)는 σ폭과 무관하게 유지.

---

## 6. 영향받는 함수 맵

| 함수 | 변경 |
|---|---|
| `loadBeacon` | ETH.STORE APR fetch 추가 → `S.staking` |
| `loadFred` | `DGS10` fetch 추가 → `S.tenY` |
| `loadLlama` | L2 3개 historicalChainTvl fetch+합산 → `S.l2` 확장 |
| `scoreFun` | L2 분위 + 스테이킹 스프레드 lerp 편입, 카드 행 표시 |
| `scoreMom` | `CFG.rocMonths` 기반 ROC |
| `drawBand` | `CFG.bandSigma` 사용 |
| `refresh` | fetch만 담당, 끝에 `recompute()` 호출 |
| **`recompute`** (신규) | 점수+렌더 (가중치 `CFG.w` 정규화 적용) |
| 신규 CFG 로드/저장/리셋, 튜닝 패널 이벤트 | localStorage 연동 |
| HTML | 펀더멘털 카드 행 추가, 튜닝 패널 마크업, 상태바/방법론 텍스트 |

---

## 7. 검증 계획 (정적 사이트)

- 로컬 정적 서버(`python3 -m http.server`)로 띄워 콘솔 에러 없음 확인.
- 각 소스 차단 시나리오에서 그레이스풀 디그레이드(예시 배지/연결 필요) 확인.
- 튜닝: 가중치 변경 시 게이지·레이더 즉시 반영 + 새로고침 후 유지, 리셋 동작 확인.
- 헤드리스 스크린샷 검증(WSL, 기존 메모 방식) 가능.

## 8. 배포 (vdi-log 방식)

- 커밋: vdiportal 저장소(`git@github.com:yotachy/vdiportal.git`).
- cafe24 SFTP: `www/portal/signal/scoopsignal.html` (자격증명 `~/projects/park/deploy.sh`).
- 공개 URL: `https://parksvc.mycafe24.com/portal/signal/scoopsignal.html`.
- 배포 대상은 `scoopsignal.html`만(CLAUDE.md·docs 제외). 수정 완료 시 커밋+push+배포 한 세트.

## 9. 비범위 (YAGNI)
- 펀더멘털 하위 가중치 분리 UI.
- L2 히스토리 캐시/전체 11개 합산.
- 스프레드의 히스토리 기반 퍼센타일 보정(고정 lerp로 시작).
