# ScoopSignal — 주기 패턴 탭 4종 추가 설계

- **날짜:** 2026-06-21
- **대상:** `signal/scoopsignal.html` (단일 파일, 바닐라 JS, 무빌드)
- **범위:** "주기 패턴" 섹션(`.charts`)에 표시 전용 패턴 탭 4개 추가

| 탭 | 내용 | 데이터 |
|---|---|---|
| ① 드로다운(언더워터) | ATH 대비 낙폭 % 시계열 | `S.week.c` |
| ② 반감기 정렬 오버레이 | BTC 반감기 기준 사이클 정렬 | `S.week.t/c` |
| ③ 실현 변동성 레짐 | 주간 수익률 롤링 변동성(연율) | `S.week.c` |
| ④ 200주선 배수(메이어) | 현재가/200주SMA 시계열 + 분위 밴드 | `S.week.c` |

**전부 새 네트워크 fetch 없음 · 종합 점수/4축에 영향 없는 표시 전용** (기존 사이클 3탭과 동일 성격).

---

## 1. 아키텍처

기존 `.charts` 섹션의 탭 패턴을 그대로 확장한다.

- 탭 버튼(`.tab[data-tab]`) + 패널(`.panel-chart[data-panel]`) + `drawXxx()` 함수 + `drawActiveChart()` 분기 추가.
- 캔버스 차트는 기존 `lineChart(cv, datasets, {logY})` 헬퍼 재사용.
- 통계 라인은 밴드 탭의 `#bandStats` 패턴을 따라 탭별 `#<id>Stats` 요소로.
- 탭 개수 3 → 7 (이미 `.tabs{flex-wrap}`). **순서:** `계절성 · 사이클 오버레이 · 반감기` → `로그 밴드 · 200주 배수 · 드로다운 · 변동성`.
- `activeTab` 문자열 스위치(`drawActiveChart`)에 4개 분기 추가. 리사이즈 리드로(`resize` 핸들러)도 동일하게 캔버스 탭이면 재그림.

### 대안 (기각)
- B안: 토글로 1탭에 묶기 — 발견성↓, 복잡. ✗
- C안: 별도 섹션 신설 — 레이아웃 중복, "주기 패턴" 개념 분산. ✗

---

## 2. 탭별 설계

### ① 드로다운(언더워터) — `drawDrawdown()`
- 계산: 누적 최고가 `peak_i = max(c_0..c_i)`, `dd_i = (c_i/peak_i − 1)×100` (≤0).
- 차트: 선형(logY=false) 단일 라인, 0 기준 아래 영역. 색은 `--bear`. `lineChart`는 음수/0 처리되므로 그대로 사용 가능(필요 시 가벼운 영역 채움은 생략 — 라인으로 충분, YAGNI).
- 통계(`#ddStats`): `현재 −X.X% · 역대 최대 −Y.Y%`. (최대 낙폭 = min(dd)).
- 데이터 범위: `S.week.c` 전체. 윈도 내 최고가 기준(ETH ATH 2021 포함되므로 실질 ATH와 일치).

### ② 반감기 정렬 오버레이 — `drawHalving()`
- 반감기 상수: `['2016-07-09','2020-05-11','2024-04-20']`.
- 각 반감기에 대해 `S.week.t`에서 가장 가까운 인덱스를 찾아(`idxNear`), 그 시점 가격을 100으로 리베이스: `vals[j] = c[start+j]/c[start]*100`.
- x축 = 반감기 후 경과(주 인덱스), y = 로그(logY=true). 과거 사이클=회색(`#8B98A6`), **현재(2024) 사이클=골드(`--gold`) 강조(w 두껍게)**.
- 기존 `drawCycle`의 `idxNear`/리베이스 로직 재사용(별도 함수, 상수만 반감기).
- 통계(`#hvStats`): `현재 반감기 후 N주 (2024-04-20 기준)`.
- 주의: 2016 반감기는 Binance 주간 데이터 시작(2017-08) 이후라 일부만 잡힐 수 있음 → 데이터 있는 구간만 그림(없으면 해당 라인 생략).

### ③ 실현 변동성 레짐 — `drawVol()`
- 주간 로그수익률 `r_i = ln(c_i/c_{i-1})`. 롤링 표준편차(창 `W=13`주) → 연율화 `vol_i = std(r[i-W+1..i]) × √52 × 100` (%).
- 차트: 라인(logY=false), 색 `--neutral`.
- 통계(`#volStats`): `현재 변동성 X% + 분위(prMeter, 과거 vol 분포 내 위치)`. 낮을수록 압축.
- `W`는 코드 상단 상수(`VOL_WIN=13`)로 두어 조정 용이.

### ④ 200주선 배수(메이어) — `drawMayer()`
- `mult_i = c_i / sma(c, 200, i)` (i ≥ 199). 기존 `S.ma200.hist`가 동일 배열(있으면 재사용, 없으면 재계산).
- 차트: 라인(logY=false), 색 `--gold`. 수평 분위 밴드 2선:
  - 저평가선 = `mult` 히스토리의 20퍼센타일, 과열선 = 80퍼센타일 (프로젝트 자가보정 원칙 — 고정 숫자 아님). 점선, 각각 `--bull`/`--bear`.
- 통계(`#mayerStats`): `현재 X.XX× · 분위 N` + 저평가/중립/과열 라벨(분위 <0.2 / 0.2~0.8 / >0.8).
- 데이터 범위: 200주 충족 이후(~2021년부터)라 라인이 짧음 — 정상.

---

## 3. 조정 파라미터 (코드 상단 상수)
- `VOL_WIN = 13` (변동성 창, 주)
- 200주 배수 밴드 분위 `0.20 / 0.80` (저평가/과열 수평선)
- 반감기 날짜 배열

> 이 값들은 튜닝 패널(localStorage)에는 넣지 않는다(표시 전용 패턴이라 점수 무관, 범위 외 — YAGNI). 코드 상수로만.

## 4. 영향 함수/마크업
| 위치 | 변경 |
|---|---|
| HTML `.tabs` | 탭 버튼 4개 추가 |
| HTML `.charts` | `panel-chart` 4개(노트+canvas+stats) 추가 |
| JS | `drawDrawdown`/`drawHalving`/`drawVol`/`drawMayer` 신규 |
| JS `drawActiveChart()` | 4개 분기 추가 |
| 상수 | `VOL_WIN`, 반감기 배열, 배수 밴드 분위 |
| method 본문 | "주기 패턴" 설명에 4종 한 줄 추가 |

## 5. 제약 (기존 Global Constraints 동일)
- 단일 파일, 무의존, 바닐라 JS. 새 fetch 금지(기존 `S` 재사용).
- 디자인 토큰만(차트 hex는 기존 `lineChart` 데이터셋 관례 유지). 한국어 UI.
- 표시 전용 — `recompute()`/점수/4축/게이지/레이더 불변.
- localStorage는 기존 `scoopsignal_cfg`만(이번엔 미사용).

## 6. 검증 (테스트 러너 없음)
- `node --check`로 JS 신택스.
- 헤드리스 렌더(WSL chromium_headless_shell + 추출 lib LD_LIBRARY_PATH): 7개 탭 전환, 각 캔버스에 라인 그려짐, 통계 라인 채워짐, 콘솔 에러 0 확인.
- Binance 차단(451) 시 사이클 탭들이 비는 기존 동작 유지(`if(S.month)`/`S.week` 가드).

## 7. 배포 (vdi-log 방식)
- 커밋 → push(`git@github.com:yotachy/vdiportal.git`) → cafe24 SFTP `www/portal/signal/scoopsignal.html`.

## 8. 비범위 (YAGNI)
- 이 패턴들을 점수에 편입.
- 튜닝 패널에 파라미터 노출.
- 일봉 기반 지표(Pi Cycle 등) — 추가 fetch 필요, 이번 범위 외.
