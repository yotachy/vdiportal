# CLAUDE.md — ScoopSignal (머니스쿱 ETH 신호 대시보드)

> 이 파일은 Claude Code가 세션 시작 시 자동으로 읽습니다. 작업 전 먼저 이 문서를 기준으로 맥락을 잡으세요.

## 1. 프로젝트 개요

- **무엇:** ETH 전용 모니터링 대시보드. 가격·온체인·유동성·사이클을 4개 축으로 점수화해 "지금 약세장인지, 강세 전환 트리거가 점등 중인지"를 한 화면에서 판단.
- **누구:** 머니스쿱(moneyscoop.co.kr) 운영. 최종 사용자는 운영자 본인 + 사이트 방문자.
- **핵심 가치:** 창의적이되 **누구나 신뢰**할 수 있을 것 → 원자료·출처·산식을 모두 노출하고, 임계값은 ETH 실제 히스토리 분포로 자가 보정.
- **결과물:** 단일 파일 `scoopsignal.html` (정적 HTML, 빌드 불필요, 의존성 없음).

## 2. 실행 / 배포

```bash
# 로컬 실행 (file:// 는 일부 API CORS에서 문제될 수 있으니 정적 서버 권장)
python3 -m http.server 8080
# → http://localhost:8080/scoopsignal.html

# 배포: 정적 호스팅에 scoopsignal.html 하나만 업로드 (moneyscoop.co.kr)
```

- 빌드 스텝 없음. 번들러·npm 의존성 없음.
- 외부 로드는 폰트 2종(CDN)뿐: Pretendard(jsdelivr), JetBrains Mono(Google Fonts).
- 모든 데이터 fetch는 **사용자 브라우저에서 클라이언트 사이드**로 발생.

## 3. 파일 구조

현재는 의도적으로 **단일 파일**(HTML+CSS+JS 인라인). 기능이 더 커지면 아래로 분리 고려:

```
scoopsignal.html          # 현재 전부 (style + script 인라인)
└─ (분리 시 제안)
   ├─ index.html
   ├─ css/dashboard.css
   ├─ js/data.js          # 데이터 로더 (loadBinance/Llama/Dollar/Fred/Beacon)
   ├─ js/score.js         # 산식 (scoreMom/Liq/Fun/Val + pctRank/fitPower)
   └─ js/render.js        # 시각화 (gauge/radar/quad/charts)
```
> 분리는 "정적 단일 파일 배포"의 단순함을 깨므로, 강한 이유 없으면 단일 파일 유지.

## 4. 아키텍처 — 데이터 흐름

- 전역 상태는 `S` 객체 하나. localStorage/세션 스토리지 미사용(매 사이클 메모리에서 갱신).
- `refresh()`가 오케스트레이터: `Promise.allSettled([loadBinance, loadLlama, loadDollar, loadFred, loadBeacon])` → 각 소스 독립적으로 성공/실패 → 점수 계산 → 렌더 → 상태 표시등 갱신. **60초 자동 갱신** + 수동 새로고침 버튼.
- **그레이스풀 디그레이드 원칙:** 한 소스가 죽어도 나머지는 동작. 점수 함수는 데이터 없으면 기본값(50) 또는 fallback 사용.

## 5. 데이터 소스 (전부 무료)

| 소스 | 엔드포인트 | 가져오는 것 | 상태 |
|---|---|---|---|
| Binance | `ticker/24hr`, `klines`(ETHBTC 1d×500, ETHUSDT 1w×520·1M×130) | 가격, ETH/BTC, 사이클·계절성·밸류밴드용 히스토리 | 무료·노키·CORS ✅ (한국에서 451 지오블록 가능 ⚠️) |
| DeFiLlama | `api.llama.fi/v2/historicalChainTvl/Ethereum`, `/v2/chains`, `stablecoins.llama.fi/stablecoincharts/Ethereum` | ETH DeFi TVL, L2 TVL 합, ETH 스테이블 공급 | 무료·노키·CORS ✅ (가장 안정적) |
| Frankfurter(ECB) | `latest`, `{start}..{end}` (USD→EUR,JPY,GBP,CAD,SEK,CHF) | 달러강도(DXY 근사, `dxyFrom()` 공식 계산) | 무료·노키·CORS ✅ |
| FRED | `{FRED_PROXY}/series/observations` (DFII10, WALCL, RRPONTSYD, WTREGEN) | 10Y 실질금리, 순유동성(WALCL−RRP−TGA) | 키 + **CORS 프록시 필요** ⚠️ (아래 §9) |
| beaconcha.in | `api/v1/validators/queue` | 검증자 입금/출금 큐 | 베스트에포트 (CORS 막히면 "연결 필요" 표시) ⚠️ |

## 6. 점수 산식 (스쿱 기준)

```
ScoopSignal = 0.30·유동성 + 0.25·모멘텀 + 0.25·펀더멘털 + 0.20·밸류   (각 0~100)
```

**축 구성**
- **모멘텀** `scoreMom` = 0.6·(ETH/BTC 50일선 이격 백분위, +기울기 보정) + 0.4·(3개월 ROC 백분위)
- **유동성** `scoreLiq` = 0.4·순유동성 추세 + 0.35·실질금리(↓가점) + 0.25·달러(↓가점) — *고정 임계값(lerp)*
- **펀더멘털** `scoreFun` = mean(ETH TVL 30d 백분위, 스테이블 30d 백분위, 검증자 큐) 
- **밸류** `scoreVal` = 0.5·(1−200주배수 백분위) + 0.5·(1−파워로 잔차 백분위) — *저평가일수록 가점*

**임계값 보정 방식 (핵심):**
- 모멘텀·펀더멘털·밸류는 고정 숫자가 아니라 **`pctRank(history, current)`** = ETH 자체 히스토리 분포의 백분위로 환산. "70점 = 과거 대비 상위 30%". → 차트 실제 분포에 자동 정합.
- 유동성(매크로)만 히스토리가 짧아 **레짐 기준 고정 lerp 임계값** 사용.
- 밸류 밴드: **로그-로그 파워로 회귀** `fitPower(times, prices, t0)`, t0 = ETH 제네시스 `2015-07-30`. 주간 데이터. R²·z·잔차 백분위 산출.

**판정 구간** (`sigOf`: ≥58 강세 / ≥43 중립 / 그 외 약세)
`0–27 약세지속 · 28–42 약세우위 · 43–57 중립·대기 · 58–71 강세전환 · 72–100 강세`

## 7. 주요 함수 맵 (어디를 고칠지)

- **데이터 추가/수정:** `loadBinance` `loadLlama` `loadDollar` `loadFred` `loadBeacon` → `S`에 저장
- **점수 튜닝:** `scoreMom` `scoreLiq` `scoreFun` `scoreVal` (임계값·가중치) / 종합 가중치는 `refresh()` 내 `score=` 라인
- **통계 헬퍼:** `pctRank` `rollChanges` `fitPower` `sma` `linreg`(미사용 잔존)
- **시각화:** `buildGauge`/`renderGauge`, `renderRadar`, `renderQuad`(사이클 시계), `lineChart`(canvas 공용), `drawHeatmap`/`drawCycle`/`drawBand`
- **UI 헬퍼:** `prMeter(pct, sig)`(분위 막대), `chip`/`cardSig`, `verdict`, `setStatus`

## 8. 코딩 컨벤션

- **바닐라 JS만.** 프레임워크·차트 라이브러리 도입 금지(단일 파일·무의존 유지). 차트는 canvas/SVG 직접.
- **방어적 fetch:** 소스별 `try/catch`, `Promise.allSettled`. 한 곳 실패가 전체를 깨면 안 됨.
- **디자인 토큰:** 색은 전부 CSS 변수(`--ink/--panel/--gold/--bull/--neutral/--bear`). 하드코딩 색 금지. 숫자는 `--mono`(JetBrains Mono).
- **UI 텍스트는 한국어.** 숫자/단위 표기 혼동 주의(예: `%`와 `%ile` 인접 금지 — 백분위는 `prMeter` 막대로 표현).
- **톤:** 미니멀·다크. 신뢰 우선 → 원자료·출처·R² 등 근거 노출. 과최적화된 화려한 지표 지양.
- 코드는 압축형(한 줄에 여러 문) 스타일 유지 중. 가독성 위해 풀어써도 무방하나 일관성 유지.

## 9. 알려진 제약 / 주의

- **Binance 지오블록(451):** 한국에서 막히면 가격·사이클·계절성·밸류 차트가 빈다. 대안: 가격 소스를 다른 거래소/프록시로 교체(`loadBinance`만 수정). 점수 로직은 그대로.
- **beaconcha.in CORS:** 막히면 검증자 큐만 비활성. 프록시 붙이면 활성.
- **FRED는 CORS 차단:** 키만으론 브라우저 직접 호출 불가 → 아래 프록시 필요. 미연결 시 `FALLBACK` 예시값 + `예시` 뱃지.
  ```js
  // Cloudflare Worker (배포 후 URL을 FRED_PROXY에)
  export default { async fetch(req){
    const u=new URL(req.url);
    const r=await fetch("https://api.stlouisfed.org/fred"+u.pathname+u.search);
    return new Response(await r.text(),{headers:{"content-type":"application/json","access-control-allow-origin":"*"}});
  }}
  ```
- **하드코딩 값:** 사이클 바닥 `2018-12-15`/`2022-06-18`(`drawCycle`), 파워로 제네시스 `2015-07-30`. 새 사이클 추가 시 갱신.
- localStorage 미사용(정적 사이트에선 써도 무방하나 현재 불필요).

## 10. 설정값 위치

`<script>` 상단 config 블록:
```js
const FRED_API_KEY="";   // 무료 키
const FRED_PROXY="";     // 위 워커 URL 루트
const FALLBACK={ realYield:1.9, realYieldPrev:1.9, netLiqChg:-1.0 };
```
종합 가중치 → `refresh()`의 `score=` 라인. 축별 임계값 → 각 `score*` 함수.

## 11. 로드맵 / TODO

- [ ] **강세 전환 알림**(ScoopSignal ≥58): 텔레그램/이메일. 정적 사이트라 별도 워커 또는 GitHub Actions 크론으로 주기 평가 → 푸시.
- [ ] **백테스트/적중률 패널**: 신호 구간과 이후 ETH 수익률의 실제 상관·히트레이트 노출(신뢰 강화).
- [ ] **순발행률(ultrasound)**: Etherscan(무료 키)으로 발행−소각 → 공급 인플레/디플레율. 펀더멘털 축에 편입.
- [ ] **스테이킹 수익률 − 10Y 스프레드**: ETH 고유의 "무위험금리 경쟁" 지표(beaconcha.in APR + FRED 10Y).
- [ ] L2 TVL을 표시용에서 **점수 항목**으로 승격(히스토리 fetch 필요).
- [ ] 가중치/σ폭/ROC기간 등 튜닝 패널(코드 수정 없이 조정).

## 12. 사용자 선호 (작업 시 참고)

- 직접적·숫자 우선 답변 선호. 작동하는 프로토타입으로 검증.
- 깔끔·미니멀 UI. 한국어 콘텐츠. 환경: Ubuntu/WSL2 + Claude Code(주), tmux, Termius+Tailscale.
- WSL2 클립보드 이미지 붙여넣기 제약, 원격 터미널 한글 IME 깨짐 이슈 있음(로컬 에디터에서 붙여넣기로 우회).
