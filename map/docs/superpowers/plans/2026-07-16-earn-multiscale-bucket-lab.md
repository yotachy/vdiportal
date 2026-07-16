# 실적 촉촉-버킷 증분 검증 랩 Plan

> 연구 랩. 산출=판정(증분≈0 기각 예상). forge-core 미변경. 컨트롤러 실행·해석.

**Goal:** 실적 근접 촉촉/확장 버킷(D≤3/5/40)이 현 5피처 인코딩 대비 갭/급변/변동성 예보에 증분을 주는지 종목내·외 OOS로 판정.

**Constraints:** forge-core 미변경(245/245) · earnings-lab 리팩터는 순수 additive(export만·standalone 출력 불변) · 관문=earnings-lab 사전등록(종목내·외 각 +1%p).

---

### Task 1: earnings-lab.js export 리팩터 (순수 additive)

**Files:** Modify `map/backtest/earnings-lab.js`

- 파일 하단 자동실행 3줄(`console.log(...)`+`evalTarget(...)`×3)을 `if (require.main === module) { ... }`로 감싼다.
- 그 위에 `module.exports = { volFeats, earnFeats, earnIndices, toNextArr, sinceArr, fit, acc, tgGap, tgSpike, tgVol, data, syms, WARM, H, STRIDE, TRAIN_FRAC, DV, DE };` 추가.
- **검증**: `node earnings-lab.js`(standalone) 출력이 리팩터 전과 동일(3타깃 리포트 그대로). `node -e "require('./earnings-lab.js')"`는 아무것도 출력 안 함(자동실행 안 됨).

- [ ] Step 1: require.main 가드 + export 추가. Step 2: standalone 실행 동일성 확인. 커밋 `refactor(backtest): earnings-lab 헬퍼 export(require.main 가드·로직 불변)`

---

### Task 2: `earn-multiscale-lab.js` — 촉촉 버킷 증분

**Files:** Create `map/backtest/earn-multiscale-lab.js`

```js
"use strict";
const E = require("./earnings-lab.js");
// 촘촘/확장 버킷: 현 earnFeats 5 + [tn<=3, tn<=5, tn<=40]
function earnFeatsMS(toNext, since, t) {
  const tn = toNext[t];
  return E.earnFeats(toNext, since, t).concat([tn <= 3 ? 1 : 0, tn <= 5 ? 1 : 0, tn <= 40 ? 1 : 0]);
}
```

- `E.data`·`E.syms` 순회, earnings-lab `build` 로직 복제(로컬)하되 각 row에 `xe5 = earnFeats`, `xeMS = earnFeatsMS`, `xF5 = vol+xe5`, `xFMS = vol+xeMS` 부착. (earnIndices/toNextArr/sinceArr/volFeats/타깃은 `E.*` 재사용.)
- 각 타깃(E.tgGap/tgSpike/tgVol)에:
  - 종목내 OOS: `fit(xF5)` acc vs `fit(xFMS)` acc → Δ.
  - 종목외 LOSO(earnings-lab 서브샘플 근사): 동일 비교.
  - 방향판별 상위3분위 상승률.
- 콘솔 표 + 판정: 촘촘버킷 증분이 **종목내 AND 종목외 ≥+1%p**인 타깃 있으면 PASS, 없으면 REJECT.

- [ ] Step 1 작성 · Step 2 실행. 커밋 `feat(backtest): 실적 촉촉-버킷 증분 검증 랩`

---

### Task 3: 판정 → 기록

- [ ] Step 1: 실행 해석(기각/통과). Step 2: **기각 시** 스코어카드 탐구표 r:no + 백로그 + 메모리(엔진 이식 종결에 실적도 추가). **통과 시** 승격 계획 별도. Step 3: 커밋+push. (백테스트 미배포·forge-core 미변경이라 배포 무관, 스코어카드만 배포.)
