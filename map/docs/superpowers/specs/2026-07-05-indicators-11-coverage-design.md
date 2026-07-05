# 스쿱포지 지표 11종 추가 — 설계 (TA 커버리지 완성)

- 날짜: 2026-07-05
- 대상: `map/forge.html` + `map/forge-core.js` (+ `map/forge-core.test.js`)
- 목적: 기술적 분석 **커버리지 완성** — 트레이더가 당연히 있을 거라 기대하는 유명 지표의 빈칸을 채운다. 현재 19종에서 **11종 추가 → 30종**.

## 배경

현재 19종은 추세(MA·추세선·슈퍼트렌드·ADX·일목)·모멘텀(RSI·MACD·스토캐스틱)·변동성(볼린저·ATR)·거래량(거래량·VWAP·볼륨프로파일)·구조/파동(시장구조·SMC·엘리어트·피보)·주기(사이클·파동스캔)를 덮는다. 그러나 **피벗 포인트·Parabolic SAR·CCI·Williams %R·채널(Keltner/Donchian)·자금흐름(MFI/CMF)** 등 널리 쓰이는 지표가 빠져 있다.

각 지표는 `forge-core.js`의 `analyzeX` 순수함수로 계산되어 결합(combine)에 방향 기여(−1…1)를 주고, 예측에 단일 드리프트항을 더하며, hero 차트에 작도되고, 시연/노드상세에 서술된다. 신규 지표도 동일 관례를 그대로 따른다(발명 없음).

## 결정 사항 (브레인스토밍 합의)

- 목적: **TA 커버리지 완성** (신호 앙상블·데모임팩트가 아니라 "없는 게 없다" 인상).
- 카테고리: 오실레이터 · 지지저항 · 추세반전 · 채널밴드 · 자금흐름 전부.
- **Stochastic RSI 제외**(RSI+스토캐스틱과 최다 중복), **Williams %R 포함**(인지도).
- 기본표시: **일부만** — 피벗·SAR 2종만 기본 켬(둘 다 메인차트 오버레이라 서브패널 안 늘림). 나머지 9종은 opt-in(레일 체크로 켬).

## 추가 목록 (11종)

| # | 지표 | id | 카테고리 | 등급 | 작도 | 기본 |
|---|---|---|---|---|---|---|
| 1 | 피벗 포인트 | `pivot` | 지지·저항 | Lv2 | 메인차트 수평선 | ✅ |
| 2 | Parabolic SAR | `psar` | 추세/반전 | Lv2 | 메인차트 점 | ✅ |
| 3 | Keltner 채널 | `keltner` | 채널/밴드 | Lv3 | 메인차트 3선 | — |
| 4 | Donchian 채널 | `donchian` | 채널/밴드 | Lv3 | 메인차트 계단선 | — |
| 5 | CCI | `cci` | 오실레이터 | Lv3 | 서브패널(±100) | — |
| 6 | Williams %R | `williams` | 오실레이터 | Lv3 | 서브패널(−20/−80) | — |
| 7 | Aroon | `aroon` | 추세/반전 | Lv3 | 서브패널(Up/Down) | — |
| 8 | MFI | `mfi` | 자금흐름 | Lv3 | 서브패널(20/80) | — |
| 9 | ROC/모멘텀 | `roc` | 오실레이터 | Lv4 | 서브패널(0선) | — |
| 10 | Awesome | `ao` | 오실레이터 | Lv4 | 서브패널 히스토그램 | — |
| 11 | CMF | `cmf` | 자금흐름 | Lv4 | 서브패널(0선) | — |

### 등급(IND_TIERS) 반영 후 배치

- **Lv1 핵심**(5): ma, macd, rsi, bollinger, volume
- **Lv2 주요**(7): trend, adx, stochastic, fib, ichimoku, **pivot, psar**
- **Lv3 보조·전문**(11): vwap, supertrend, atr, volumeprofile, structure, **cci, williams, aroon, keltner, donchian, mfi**
- **Lv4 고급·심화**(7): elliott, smc, cycle, phasefold, **roc, ao, cmf**

`EV_DEFAULT_VISIBLE`에 `pivot`, `psar` 추가.

## 지표별 상세 (계산 · 방향 · 드리프트 · 작도)

방향 기여는 −1(강한 하락)…+1(강한 상승). 드리프트 cap은 보수적(커버리지 지표가 예측을 지배하지 않게). 모두 `bias × trendProfileForTF(tf).trendScale × cap`의 단일 드리프트항, 이중계상 금지.

### 오버레이 (메인차트 작도)

1. **피벗 포인트 `pivot`** (params: `{tf:"auto"}`)
   - 계산: 직전 기간(일봉이면 전일) HLC로 P=(H+L+C)/3, R1=2P−L, S1=2P−H, R2=P+(H−L), S2=P−(H−L), R3=H+2(P−L), S3=L−2(H−P).
   - 방향: `clamp((close−P)/max(1e−9, R1−S1))` — 피벗 위=강세. R/S 근접 시 소폭 감쇠(저항 근접=상방 저항).
   - 드리프트 cap **.04**(S/R라 약한 방향).
   - 작도: 메인차트에 P(굵게)·R1~3·S1~3 수평선 + 라벨. 화면 밖 레벨은 피보식 가장자리 마커(`▲/▼`).

2. **Parabolic SAR `psar`** (params: `{step:0.02, max:0.2}`)
   - 계산: Wilder PSAR(AF 가속, EP 갱신, 상/하 전환).
   - 방향: 가격>SAR=+ / <SAR=−. 최근 플립(전환) 직후면 강도 가중.
   - 드리프트 cap **.08**.
   - 작도: 메인차트에 캔들 위/아래 점(dots) 시퀀스. reveal 게이트.

3. **Keltner 채널 `keltner`** (params: `{len:20, atrLen:10, mult:2}`)
   - 계산: mid=EMA(close,len), upper/lower=mid±ATR(atrLen)×mult.
   - 방향: 채널 내 %위치(볼린저와 동형) + 상/하단 돌파. 볼린저와의 **스퀴즈**(Keltner 안에 볼린저 들어오면 변동성 수축) meta 노출.
   - 드리프트 cap **.06**.
   - 작도: 메인차트 mid/upper/lower 3선(볼린저와 구분 스타일).

4. **Donchian 채널 `donchian`** (params: `{len:20}`)
   - 계산: upper=max(high,len), lower=min(low,len), mid=(upper+lower)/2.
   - 방향: 종가가 상단 근접/돌파=+, 하단=−, + 중앙선 기울기.
   - 드리프트 cap **.07**.
   - 작도: 메인차트 상/하/중 계단선(step).

### 서브패널 (오실레이터·추세·자금흐름 — 5~11, 신규 서브패널)

> 카테고리는 위 표 기준(CCI·Williams·ROC·AO=오실레이터, Aroon=추세/반전, MFI·CMF=자금흐름). 여기서는 **작도 성격(서브패널)**으로 묶는다.

5. **CCI `cci`** (params: `{period:20}`)
   - 계산: TP=(H+L+C)/3, CCI=(TP−SMA(TP))/(0.015×meanDev).
   - 방향: >+100 상승 모멘텀/과열, <−100 하락/과매도, 0선 교차. **Cardwell식 국면**(RSI와 동일 접근: 강세 국면에선 과열을 약하게) 적용.
   - 드리프트 cap **.06**. 서브패널 ±100 밴드.

6. **Williams %R `williams`** (params: `{period:14}`)
   - 계산: %R=−100×(HH−close)/(HH−LL).
   - 방향: −20 과매수/−80 과매도(스토캐스틱 동형) + 국면.
   - 드리프트 cap **.05**. 서브패널 −20/−80.

7. **Aroon `aroon`** (params: `{period:25}`)
   - 계산: AroonUp=100×(period−sinceHH)/period, AroonDown=100×(period−sinceLL)/period. 오실레이터=Up−Down.
   - 방향: (Up−Down)/100, + 추세강도(둘 다 높/낮 여부).
   - 드리프트 cap **.06**. 서브패널 Up/Down 2선(또는 Up−Down 단일).

8. **MFI `mfi`** (params: `{period:14}`) — 거래량 의존
   - 계산: TP·거래량 기반 Money Flow Index(거래량 가중 RSI). 실거래량 없으면 `synthVolume` 폴백.
   - 방향: 자금유입(>50)/이탈(<50), 20/80 극단, 국면(RSI식).
   - 드리프트 cap **.06**. 서브패널 20/80. **합성거래량 시 카베아트**.

9. **ROC/모멘텀 `roc`** (params: `{period:12}`)
   - 계산: ROC=(close/close[−period]−1)×100.
   - 방향: 부호 + 0선 교차 + 최근 기울기.
   - 드리프트 cap **.06**. 서브패널 0선.

10. **Awesome `ao`** (params: `{fast:5, slow:34}`)
    - 계산: median=(H+L)/2, AO=SMA(median,fast)−SMA(median,slow).
    - 방향: 0선 교차 + 새서(saucer, 3봉 반전) + 부호.
    - 드리프트 cap **.06**. 서브패널 히스토그램(상승/하락 막대색).

11. **CMF `cmf`** (params: `{period:20}`) — 거래량 의존
    - 계산: MFV=((C−L)−(H−C))/(H−L)×volume, CMF=ΣMFV/Σvolume over period.
    - 방향: >0 매집(+) / <0 분산(−).
    - 드리프트 cap **.05**. 서브패널 0선. **합성거래량 시 카베아트**.

## 통합 6-피스 (지표당 동일)

1. `forge-core.js`: `analyzeX(data, params)` 순수함수(+meta) + `xSteps()`. UMD 유지.
2. `evalBlocks` 케이스: combine에 방향 기여 주입. MFI·CMF는 거래량을 쓰나 **방향성 오실레이터**라 `dirIns`에 포함(비방향 `volume`/`ticker`만 제외 — 기존 로직 그대로 커버됨).
3. 예측 단일 드리프트항(`run()`): 위 cap으로 `xDrift` 1개 가산.
4. hero 작도: 오버레이(`_drawXLayers`, 메인차트) 또는 서브패널 렌더. reveal 게이트·오프스케일 마커(피보 재사용).
5. `analysisSteps` 케이스: 시연 진행 로그 서술.
6. `nodeExpert` 통일: 노드 상세 카드.

부수: `BLOCK_DEFS`(id·라벨·params), `EV_COLORS`(고유 색 11개), `IND_TIERS` 배치, `EV_DEFAULT_VISIBLE`(pivot·psar).

## 테스트

`forge-core.test.js`에 지표당 방향성 sanity 테스트:
- 상승 추세 시계열 → 방향 기여 > 0 (해당 시), 하락 → < 0.
- 경계/결측(짧은 시계열, 0분모) 가드: NaN·throw 없음.
- MFI/CMF: 거래량 없을 때 synthVolume 폴백 동작, throw 없음.
- 기존 테스트 회귀 0(현재 통과 수 유지, 신규만 증가).

## 단계 (Phasing)

- **Phase A · 오버레이 4종**: pivot, psar, keltner, donchian (서브패널 불필요, 메인차트 작도).
- **Phase B · 오실레이터 5종**: cci, williams, roc, ao, aroon (서브패널 신규).
- **Phase C · 자금흐름 2종**: mfi, cmf (거래량 의존·synthVolume 폴백).

각 페이즈 = 코어 analyzeX+테스트 → evalBlocks+드리프트 → 작도 → steps/nodeExpert → 색/등급/기본표시. 페이즈 단위 배포·검증(헤드리스 + node 테스트 + 라이브 curl).

## 비목표 (YAGNI)

- Stochastic RSI, Ultimate/TRIX/DPO, Chaikin Oscillator, A/D Line, 하모닉 패턴, 렌코/하이킨아시 등은 이번 배치 제외.
- 외부데이터(펀딩·미결제약정·공포탐욕) 지표 제외 — 순수 OHLCV 기반만.
- 신규 아이콘(ICONS) 추가는 선택(노드 아이콘용) — 필수 아님.

## 제약 / 주의

- 단일 HTML + forge-core.js UMD 유지, 빌드툴 없음.
- 좌측 컬러 accent line 금지(등급/상태는 배지·배경·텍스트로만) — 신규 서브패널·배지도 준수.
- 드리프트 이중계상 금지: 각 지표 단일 항, `trendProfileForTF` 경유.
- 예측 안정성: 신규 지표 기본 cap 보수적(≤.08) — 커버리지 지표가 예측을 지배하지 않게.
- 배포 불가침 데이터(`forge_data.json`·`forge_images.json`·`forge_jobs.json`·`forge_td_key.txt` 등)는 건드리지 않음.
