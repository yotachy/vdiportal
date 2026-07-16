# 드리프트 영향 천장(ceiling) 검증 랩 설계

- 날짜: 2026-07-16 · 상태: 승인됨 · 성격: 연구/검증 랩(일반 상한 증명)
- 배경: [[scoopforge-engine-multiscale-rejected]](structure·rel·실적 3축 기각) · [[scoopforge-edges-cosmetic]](노드존재+conviction이 결정, 개별 드리프트 미미)
- 대상: **pivot·gann·volume**(사용자 요청) + structure 재확인

## 1. 목표 / 아이디어
pivot/gann/vol 각각을 억지 다중스케일화하는 대신, **더 일반적·결정적** 질문을 푼다: *"이 지표가 애초에 엔진 방향(`sign(verdict.score)`)을 바꿀 수 있는가?"*

- 다중스케일이든 어떤 재공식화도 지표 bias를 **[−1,1]** 안에서만 바꾼다. 그래서 bias를 **+1 vs −1 극단**으로 강제했을 때 `sign(score)` 뒤집힘 비율 = **그 지표가 엔진 방향에 미칠 수 있는 최대 영향의 천장**.
- 천장 ~0이면 **다중스케일 포함 어떤 재공식화도 엔진 방향 무효** — 특정 변형 하나만 테스트하는 것보다 강한 증명.
- 드리프트 캡: pivot **0.04**·gann **0.05**·volume **0.05**(structure 0.08보다 작음 → structure가 이미 0.0 델타라 이들도 ≤). 실측으로 확정.

## 2. 방법
- **run()에 기본-off `opts._biasSet` 플래그 1개 추가**: `{ pivot|gann|volume|structure: value }`이면 해당 드리프트의 bias 원천을 그 value로 치환(다른 계산 동일). `opts.draw`·`_msStruct` 동형 — 기본(미지정)에서 표준과 **완전 동일**(`node --test forge-core.test.js` 245/245). `_msStruct`는 이 일반 플래그로 흡수 가능(선택).
- **랩 `drift-ceiling-lab.js`**: walk-forward(fixtures 55종·WARMUP 200·STRIDE 10). 각 지표 ind∈[pivot,gann,volume,structure], 시점 t:
  - `sPlus = sign(run(_biasSet={ind:+1}).verdict.score)`, `sMinus = sign(run(_biasSet={ind:-1}).verdict.score)`.
  - `flip = sPlus !== sMinus`.
  - **부수**: baseline `sign(run().score)` 대비 +1일 때·−1일 때 각 방향 적중 비교(뒤집히는 시점에서라도 유리한지).
  - sanity: `_biasSet={}` == 무플래그.
- 지표별 **천장 = flip 비율**(전 시점). + 뒤집힘 시점의 방향 적중(±1 각각).

## 3. 판정
- **천장 < ~2%** → 그 지표는 엔진 방향을 거의 못 바꿈 → **다중스케일 포함 재공식화 무효 확정**(REJECT).
- 천장이 유의미(>~5%)하고 뒤집힘 시점에서 한쪽 극단이 실제 방향과 유의하게 맞으면 → 그 지표만 재공식화 여지(PASS, 별도 정밀검증). 예상: 전부 천장 ~0.

## 4. 격리 / 산출물
- forge-core: **기본-off 플래그 1개**만(기본 동작·baseline 불변). 랩은 `map/backtest/`. 승격 대상 없음(이건 상한 증명·기각 확정용).
- 산출 = pivot/gann/vol 천장 숫자 + 판정. 스코어카드 탐구표·백로그·메모리 기록.
- 회귀: 플래그 off == 표준 → 245/245.

## 5. 예상
캡이 작아(0.04~0.05) 천장 ~0 예상 — structure(0.08) 델타 0.0의 필연적 귀결. 이 랩으로 pivot/gann/vol을 실측 확정하고, **일반 상한**으로 "개별 드리프트 재공식화(다중스케일 포함)는 엔진 방향 개선 불가"를 못박는다.
