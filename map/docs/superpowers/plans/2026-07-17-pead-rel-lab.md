# PEAD → 상대방향 증강 검증 Plan

> 연구 랩. 데이터 수집 불필요(earn-ohlc 보유). forge-core 미변경. 산출=판정.

**Goal:** PEAD(실적일 반응 드리프트)가 rel25(deployed) 위 상대방향 +1.5pp 증분 주는지 판정(대형주 30종 먼저).

**Constraints:** forge-core 미변경(246/246) · look-ahead=t≥eIdx+2만 reaction 참조 · rel 사전등록 관문 · deployed base=rel25.

---

### Task 1: `pead-feats.js` + 단위테스트

**Files:** Create `map/backtest/pead-feats.js`, `pead-feats.test.js`

```
peadArray(closes, dates, earnings, opts={win:45}) → [[r,pos,rd,mag]... 길이 N]
  각 실적일→eIdx(dates≥ed 최근·이진). reaction=close[eIdx+1]/close[eIdx-1]-1.
  t∈[eIdx+2, eIdx+win]: [clamp(reaction,±.5), (t-eIdx)/win, clamp(reaction*(1-(t-eIdx)/win),±.5), min(|reaction|,.5)]. 그 외 [0,0,0,0].
```
- 순수·결정적. 테스트: 창 내 부호=reaction 부호·창 밖 0·look-ahead(t<eIdx+2 미참조)·경계·빈.
- [ ] TDD 5스텝. 커밋.

### Task 2: `pead-rel-lab.js`

**Files:** Create `map/backtest/pead-rel-lab.js`

- earn-ohlc 30종·SPY(fixtures-shortint/SPY.json) 날짜맵. 종목별: full 시계열 peadArray → SPY 정렬(spyMap)로 (P,SPY,R,peadAligned). structFeats(P)+structFeats(R)+beta=rel25.
- base=rel25 vs aug=rel25+pead4. 타깃 상대아웃퍼폼(vs SPY) h=10/20/40. 종목내 60/40 + LOSO + 전후반. 프리필터(단변량·증분).
- **PEAD-창 부분집합**(신호≠0 행만) 적중률 별도 리포트. 관문 +1.5pp.
- [ ] Step 1 작성. Step 2 실행. 커밋.

### Task 3: 판정 → 기록

- [ ] Step 1 해석(창내 vs 전체·모멘텀 흡수 여부). **통과 시** 승격/소형주 확장. **기각 시** 스코어카드 탐구표 r:no + 백로그 + 메모리(대형주 PEAD·모멘텀 흡수). Step 2 커밋+push·스코어카드 배포.
