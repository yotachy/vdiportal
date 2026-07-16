# 상대강도 스윙-티어 피처 증분 검증 랩 Plan

> 연구 랩. 산출 = 판정(프리필터 기각 가능성 높음). forge-core 미변경(승격 시에만). 컨트롤러 실행·해석.

**Goal:** 상대비율 R=P/SPY의 스윙-티어(대/중/소) 피처가 기존 rel 25피처에 증분 예측력을 주는지 프리필터로 판정.

**Constraints:** forge-core 미변경(245/245 유지) · walk-forward/OOS 분할 · rel-lab 파이프라인·feat-lib 재사용 · 프리필터 기각 시 재학습 안 함.

---

### Task 1: 티어-피처 헬퍼 + 단위테스트

**Files:** Create `map/backtest/rel-tier-feats.js`, `rel-tier-feats.test.js`

**Produces:** `relTierFeats(series) → [msBias, 대bias, 중bias, 소bias, 일치도]` (길이 5, 티어 부족 시 [0,0,0,0,0])

```js
"use strict";
const FC = require("../forge-core.js");
function tierBias(t) { return t.event === "BOS_up" ? 0.6 : t.event === "BOS_down" ? -0.6 : t.event === "CHoCH_up" ? 0.5 : t.event === "CHoCH_down" ? -0.5 : t.trend === "up" ? 0.3 : t.trend === "down" ? -0.3 : 0; }
function relTierFeats(series) {
  const r = FC.collectStructure(series, {}), ts = (r && r.tiers) || [];
  if (!ts.length) return [0, 0, 0, 0, 0];
  const byDeg = { 0: 0, 1: 0, 2: 0 };
  let sw = 0, sb = 0, agree = 0;
  for (const t of ts) { const w = t.significance || 0, b = tierBias(t); sw += w; sb += w * b; byDeg[t.degree] = b; agree += Math.sign(b); }
  const ms = sw ? Math.max(-1, Math.min(1, sb / sw)) : 0;
  return [ms, byDeg[0], byDeg[1], byDeg[2], Math.max(-1, Math.min(1, agree / ts.length))];
}
module.exports = { relTierFeats, tierBias };
```

테스트: 길이 5 · 값 범위 [-1,1] · 짧은 입력 [0,0,0,0,0] · 결정성.

- [ ] TDD 5스텝. 커밋 `test(backtest): rel 스윙-티어 피처 헬퍼`

---

### Task 2: `rel-multiscale-lab.js` — 캡처 + 프리필터 리포트

**Files:** Create `map/backtest/rel-multiscale-lab.js`

rel-lab `buildRows` 패턴(US 31종+SPY·R=P/spy·`F.structFeats`×2+beta=x25·y[H]=상대아웃퍼폼·prevRel·relMom). 각 row에 `relTierFeats(R.slice(0,t+1))` 5피처 부착.

프리필터(HS=[10,20,40], `feat-lib.logitFit/acc/splitIdx`, 심볼별 시간 60/40 OOS):
- **(a) 단변량**: 각 신피처 `sign(f)` vs `y[20]` 적중률.
- **(b) 증분**: `logitFit(train x25)` vs `logitFit(train x25+신5)` → TEST 적중률(지평별) + Δ.
- **(c) 공선성**: 각 신피처 ~ x25 선형회귀 R²(높으면 중복).
- 콘솔 표 + 판정: 신피처 최고 단변량 ≤51% AND 증분 Δ 전지평 ≤+0.5pp → REJECT.

- [ ] Step 1 작성 · Step 2 소표본 스모크 · 커밋 `feat(backtest): rel 스윙-티어 증분 프리필터 랩`

---

### Task 3: 실행 → 판정 → 기록

- [ ] Step 1: 전체 실행(US 31종) → 리포트.
- [ ] Step 2: 판정 해석(프리필터 기각/통과).
- [ ] Step 3: **기각 시** 스코어카드 탐구표 r:no + 백로그 + 메모리(재시도 조건). **통과 시** 승격 계획 별도.
- [ ] Step 4: 커밋+push. (백테스트는 배포 대상 아님 · forge-core 미변경이라 배포 무관.)
