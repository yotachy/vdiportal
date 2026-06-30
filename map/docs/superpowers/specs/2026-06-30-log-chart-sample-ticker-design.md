# Log 차트 토글 + 샘플 티커 블록 (Log Chart & Sample Ticker) — 설계

- 작성일: 2026-06-30
- 대상: 스쿱포지(Scoop Forge) — `forge.html` + `forge-core.js`
- 선행: 티커 캔들차트(실 OHLC fetch·캔들 렌더·hero 줌/팬) 배포됨.
- 상태: 설계 승인됨 (구현 계획 대기)

## 1. 배경 / 요청

사용자 3가지 요청:
1. **샘플 포지에 티커 블록 기본 포함** — 지금 샘플은 베이크된 데모 BTC만 있어 실 종목 분석 시 사용자가 티커 블록을 직접 추가해야 함.
2. **Log/선형 차트 토글** — 가격 캔들차트를 로그 스케일로 볼 수 있게(긴 추세·배수 변화 가독).
3. **차트 드래그 + 확대/축소** — *이미 구현됨*(`_heroZoom` 휠 줌 + 드래그 팬 + ⊕리셋, hero 차트 모드). 단 차트 모드(`hasRealSeries()`)에서만 동작 → 샘플에 티커가 없어 차트 모드 미진입으로 "안 되는 것처럼" 보였음. **#1이 #3을 활성화** → #3은 신규 코드 없이 검증.

## 2. 결정 (브레인스토밍)

- 샘플 티커: **심볼 미리채움(`BTC-USD`) + 수동 불러오기**. 샘플 생성 시 자동 fetch 안 함(API 호출 낭비·오프라인 안전). 데이터 없을 땐 기존 베이크 데모 표시, 사용자가 `📈 캔들 불러오기` 누르면 실데이터로 전환(priceSeries 우선 채택).
- Log 토글: **포지별 영속**(캔버스 문서에 저장 → 재방문·새로고침 유지).

## 3. 샘플 티커 블록

- `forge-core.js` `sampleGraph()`의 `nodes`에 티커 노드 추가:
  `{ id:"s_ticker", kind:"block", blockType:"ticker", params:{ symbol:"BTC-USD", tf:"1day" }, x, y, title:"티커", conviction:0, weight:50, desc:"실 종목 데이터 — 불러오기로 실 캔들 적용" }`.
- **엣지 불필요**: `priceSeries()`가 시계열 로드된 티커 노드를 전역 최우선 소스로 자동 채택. 데이터 없으면 기존 `s_price`(베이크) 사용 → 샘플 첫 표시는 데모 그대로(회귀 0). 사용자가 불러오면 `data.price`=실 종가가 되어 기존 `s_price→지표→결합→예측` 배선이 그대로 실 종목 분석.
- `buildSampleForge()`/`newSampleDoc()`는 `sampleGraph().nodes`를 그대로 주입하므로 추가 분기 불필요.
- 테스트: `sampleGraph: …노드` 개수 테스트를 11→**12**로 갱신(진실 반영). 티커 노드 존재·params.symbol 단언 추가.

## 4. Log/선형 차트 토글

### 4.1 상태·영속
- 전역 `_logChart`(bool, 기본 false=선형). **포지별 영속**: `serializeActive()`(961행)에 `dc.logChart = _logChart`, `loadDoc()`(985행)에서 `_logChart = !!dc.logChart` 복원(+토글 버튼·재렌더). (themeImgId/view와 동일 패턴.)
- 토글 시 `markDirty()`로 자동저장.

### 4.2 좌표 변환 (핵심 — 차트·근거 작도 일관)
- 가격→y 매핑 두 곳을 로그 인지로:
  - `fcDrawMainChart` toY(2481행): `const toY = v => padTop + (1 - (tvLog(v) - tvLog(loV)) / ((tvLog(hiV) - tvLog(loV)) || 1)) * (ch - padTop - padBot);`
  - evidence chart-mode toY(2868행): `g.loV`/`g.hiV`/`g.log` 기반 동일 식.
- 공유 헬퍼 `tvLog(x, on)`: `on ? Math.log(Math.max(1e-9, x)) : x`. `_mainGeo`에 `log:_logChart` 저장 → evidence가 같은 플래그 사용. → 가격 캔들·선·**예측 콘**(toY 사용)·**근거 작도**(M.pToY=evidence toY)·y축 라벨 전부 동일 로그 변환(정합).
- 캔들/줌·팬(`_heroZoom`)·DPR·호버 툴팁은 toY만 거치므로 자동 정합. 호버 가격역산이 toY 역함수를 쓰면 로그도 반영(필요 시 보정).

### 4.3 토글 버튼
- 차트 헤더 액션부(`.fc-head-actions`, `📈 차트뷰`/`◈ 근거` 옆)에 `<button id="logToggle" class="ev-toggle" onclick="toggleLogChart()">📊 LOG</button>`. 활성 시 `.on` 클래스. `toggleLogChart()`가 `_logChart` 반전 → 버튼 상태 갱신 → `renderChart()`/재렌더 → `markDirty()`.
- 라벨: 선형=`📊 LOG`(로그로 전환), 로그=`📊 선형`(선형으로 전환) 또는 `.on` 표시로 구분.

## 5. 드래그 + 확대/축소 (기존 — 검증만)

- `_heroZoom` 휠 커서줌(1~6x) + 드래그 팬(확대 시) + 더블클릭/⊕ 리셋이 hero 차트 모드에서 동작. 샘플 티커 로드 → 차트 모드 → 동작. **신규 코드 없음**(YAGNI), 라이브에서 동작 확인.

## 6. 영향 / 호환 / 비목표

- 코어 변경: `sampleGraph()` 노드 1개 + 테스트 개수. `run`/작도 로직 무변경(티커는 priceSeries 경유). 테스트 갱신 후 그린 유지.
- `_logChart=false`·티커 미로드 시 기존과 시각 동일(회귀 0). 로그는 양수 가격 전제(가격은 항상 양수).
- 비목표(YAGNI): 로그 y축 눈금 라벨의 로그 간격 정밀화(상단/하단 2값만 표기 유지), 횡스크롤로 더 많은 과거 탐색(현 180봉 윈도 유지), 드래그-팬 s=1 허용(고정 윈도라 무의미).
- 단일 HTML·바닐라 JS·무빌드·다크 토큰·한국어·noindex·POST<128KB 유지.

## 7. 검증

- 코어: `node --test forge-core.test.js` — sampleGraph 12노드·티커 존재 테스트 포함 그린.
- forge.html 인라인 파싱. 헤드리스/라이브: 샘플에 티커 블록 보임·심볼 BTC-USD 프리필; `📊 LOG` 토글 시 캔들·선·콘·근거 작도가 **함께** 로그 변환(어긋남 0)·재방문 유지; 차트 모드에서 휠 줌·드래그 팬 동작.
