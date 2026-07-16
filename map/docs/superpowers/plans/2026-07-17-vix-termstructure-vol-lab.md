# VIX 기간구조 → 변동성 예보 증분 검증 Plan

> 연구 랩. FRED 2 series + earnings-lab 재사용. forge-core 미변경. 산출=판정(공선→기각 예상).

**Goal:** VIX 기간구조(implied vol)가 종목별 realized-vol 변동성 예보에 +1%p 증분 주는지 판정.

**Constraints:** forge-core 미변경(246/246) · look-ahead=같은 캔들 날짜 VIX(EOD) · earnings-lab 사전등록 관문(종목내·외 +1%p).

---

### Task 1: `collect-vix.js` — FRED VIX·VIX3M 수집

**Files:** Create `map/backtest/collect-vix.js` → `vix-series.json`

- FRED CSV: `https://fred.stlouisfed.org/graph/fredgraph.csv?id=VIXCLS` · `id=VXVCLS`. 파싱(헤더 스킵·값 "." 스킵). 병합 `{ "YYYY-MM-DD": {vix:Number, vix3m:Number|null} }`.
- [ ] Step 1 작성·실행. Step 2 커버리지(행수·날짜범위) 확인. 커밋.

### Task 2: `vix-feats.js` + 단위테스트

**Files:** Create `map/backtest/vix-feats.js`, `vix-feats.test.js`

```
buildVixArrays(vixSeries) → { dates:[...정렬], vix:[...], vix3m:[...] }  // 날짜 오름차순 배열
vixIndexForDate(dates, d) → 그 날짜 이하 최근 인덱스(이진탐색) | -1
vixFeats(dates, vix, vix3m, i) → [lvl, termStruct, chg5, pctile] | [0,0,0,0]  // i<5 or vix3m 없으면 부분 0
```
- 순수·결정적. 테스트: 기간구조 부호(vix>vix3m→양수)·5일변화·백분위 범위·경계(i<5·vix3m null)·빈.
- [ ] TDD 5스텝. 커밋.

### Task 3: `vix-vol-lab.js` — earnings-lab 증강 검증

**Files:** Create `map/backtest/vix-vol-lab.js`

- `E=require("./earnings-lab.js")`. `E.data`(earn-ohlc·candles에 t) 순회, 각 종목 캔들 날짜 배열 → `vixIndexForDate`로 VIX 정렬. volFeats(10) + vixFeats(4) 부착.
- 타깃 E.tgGap/tgSpike/tgVol 각각: base=vol10 vs aug=vol10+vix4. 종목내 60/40 + 종목외 LOSO(earnings-lab 패턴). 프리필터(단변량·증분).
- 관문: 증분 종목내 AND 종목외 +1%p. 콘솔 표+판정.
- [ ] Step 1 작성. Step 2 실행. 커밋.

### Task 4: 판정 → 기록

- [ ] Step 1 해석(공선 여부). **통과 시** 승격 계획 별도(VIX 라이브+모델·validatedAxes·스코어카드 채택축). **기각 시** 스코어카드 탐구표 r:no + 백로그 + 메모리(옵션 포지셔닝=유료막힘·VIX프록시=공선). Step 2 커밋+push·스코어카드 배포.
