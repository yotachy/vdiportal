# 티커 캔들차트 자동 생성 + 작도 (Ticker Candle Chart) — 설계

- 작성일: 2026-06-30
- 대상: 스쿱포지(Scoop Forge) — `forge.html` + `forge-api.php` (+ 코어 `forge-core.js`는 필요 시 최소)
- 선행: 근거 작도 가독성(줌/팬·포커스·DPR3) 배포됨. hero가 차트/이미지 2모드인데, 이미지 모드는 저화질 원본 스크린샷 위에 작도해 품질 한계.
- 상태: 설계 승인됨 (구현 계획 대기)

## 1. 배경 / 문제

현재 hero `heroMode()`는 실 시계열(`hasRealSeries()`)이 있으면 자체 렌더 **선(line) 차트**, 없으면 업로드 **이미지**를 보여준다. 대부분의 포지는 이미지 모드라 **저화질 스크린샷 위에 작도**가 얹혀 가독성·품질이 낮고, 줌/팬·DPR3 개선도 차트 모드에서만 보인다.

목표: **티커만 입력하면 그 종목의 실 OHLC를 가져와 고화질 캔들차트를 자체 렌더하고 그 위에 작도**한다. 이미지 의존을 끊고 차트 모드를 주(主) 화면으로. 데이터는 **안정·정확** 우선(비공식 스크래핑 API 배제) — 정식 API + 무키 폴백 + 서버 캐시 다중소스.

## 2. 데이터 제공처 (안정성·정확성)

- **주: Twelve Data 정식 API** — 주식·ETF·암호화폐·지수·포렉스 광범위, 라이선스 피드(정확), 정식 키 기반(임의 차단 없음). 무료 티어(8req/분·800req/일) + **서버 캐시**로 한도 흡수. 키는 **서버 전용 파일**에만.
- **폴백: Stooq 무료 CSV** — 무키·장수 서비스, 주식/지수/포렉스 일봉. Twelve Data 실패·무키·한도초과 시 자동 전환 → 서비스 무중단성 강화.
- **한계(명시)**: "모든 티커"는 광범위하나 100%는 아님 — 미존재 심볼은 명확한 에러. 무료 외부 데이터라 계약상 무중단은 아님(다중소스+캐시로 현실적 최대 안정성). 진짜 SLA는 추후 유료 피드를 같은 프록시에 교체.

## 3. 아키텍처

```
[가격 노드: ticker, tf] --불러오기--> forge.html fetchOHLC()
        │  GET forge-api.php?ohlc=1&symbol=AAPL&tf=1day
        ▼
   forge-api.php (서버)
     Twelve Data(키 주입) ──실패──> Stooq CSV ──정규화──> {symbol,tf,source,candles:[{t,o,h,l,c,v}]}
     (화이트리스트·md5 캐시 TTL)
        ▼ JSON
   forge.html: candles → data.candle/data.price + 노드 영속 → fcDrawMainChart(캔들) + drawEvidence(작도) + run(예측)
```

- 클라이언트는 **심볼/tf만** 보내고 업스트림 URL·키를 모른다(프록시가 소스 선택·키 주입·정규화).
- 코어 `run()`/작도는 **이미 `data.candle`/`data.price`를 소비** → 캔들 데이터를 그 형식으로 주입하면 작도·예측이 실데이터 위에서 동작(코어 변경 최소/없음).

## 4. 서버 프록시: `forge-api.php` OHLC 엔드포인트 (신규)

GET `?ohlc=1&symbol=<sym>&tf=<1day|1week|1month>` → JSON.

### 4.1 보안·검증
- `symbol` 정규식 화이트리스트: `^[A-Za-z0-9.\-^=]{1,16}$`(영숫자·`.`·`-`·`^`·`=`). 그 외 400.
- `tf` ∈ {`1day`,`1week`,`1month`}(기본 `1day`). 그 외는 `1day`.
- 출력 캔들 수 상한(`outputsize=400`), 시간순(과거→현재) 정렬.

### 4.2 키 (서버 전용·배포 불가침)
- Twelve Data 키는 **서버 전용 파일** `forge_td_key.txt`(git 미포함·`.gitignore`, **배포 시 업로드 금지** = `forge_data.json`급 불가침)에서 읽음: `$TD_KEY = is_file(__DIR__.'/forge_td_key.txt') ? trim(file_get_contents(...)) : '';`. **forge-api.php 코드 배포가 키를 덮어쓰지 않음**(키는 별도 파일). 키 없으면 Twelve Data 건너뛰고 바로 Stooq.

### 4.3 소스 호출 (signal/api.php 패턴 차용: curl·FOLLOWLOCATION false·타임아웃)
1. **Twelve Data**(키 있을 때): `https://api.twelvedata.com/time_series?symbol=<sym>&interval=<tf>&outputsize=400&apikey=<TD_KEY>&format=JSON`. 응답 `{values:[{datetime,open,high,low,close,volume}...]}`(최신→과거) → 역순 정렬 → 정규화. `{status:"error"}` 또는 빈 values면 실패로 간주.
2. **Stooq 폴백**: `https://stooq.com/q/d/l/?s=<sym>&i=d`(일봉만; tf!=1day여도 일봉 CSV) → CSV `Date,Open,High,Low,Close,Volume` 파싱(헤더 스킵, 빈/`N/D` 라인 무시) → 정규화. 둘 다 실패면 502 + `{ok:false,error:"notfound"}`.

### 4.4 정규화 출력
```json
{ "ok": true, "symbol": "AAPL", "tf": "1day", "source": "twelvedata|stooq",
  "candles": [ { "t": "2026-01-02", "o": 185.1, "h": 187.4, "l": 184.0, "c": 186.9, "v": 51234000 }, ... ] }
```
- 시간순(오래된→최신). 숫자 캐스팅·유한값만. 캔들 < 2면 에러.

### 4.5 캐시
- `forge_ohlc_cache_<md5(symbol|tf)>.json`, TTL: 1day=**1h**, 1week/1month=**6h**(일봉 EOD는 장중 안 바뀜). 캐시 신선하면 즉시 반환. 캐시 파일도 서버 산출물 → **배포 불가침**.

## 5. 클라이언트: 티커 UI + fetch (`forge.html`)

> 기존 구조 활용: **`ticker` 블록타입 노드가 이미 존재**(`params:{symbol,price}`), 그 편집기에 **"티커 심볼" 입력이 이미 있음**(`data-tkr="symbol"`, 약 1291행). `priceSeries()`(약 3894행)가 price 노드 `series`(길이≥20) 또는 비전 시계열을 반환하고, `hasRealSeries()=!!priceSeries()`가 차트/이미지 모드를 가른다.

### 5.1 ticker 노드 입력 (기존 심볼 입력에 추가)
- ticker 노드 편집기에 기존 심볼 입력 옆에 **타임프레임 셀렉트**(`params.tf`, 일/주/월·기본 일) + **`불러오기` 버튼** 추가. 형식 힌트(예: `AAPL`·`BTC-USD`·`^GSPC`).
- `불러오기` → `fetchOHLC(symbol, tf)`(GET `forge-api.php?ohlc=...`). 로딩 표시, 에러 시 토스트("심볼을 찾을 수 없어요" 등).

### 5.2 데이터 적용·영속
- 수신 `candles` → **ticker 노드에 저장**: `n.series = candles.map(c=>c.c)`(종가) + `n.ohlc = candles`(렌더용 OHLC) + `n.tf`. **POST <128KB 유지**: `n.ohlc`는 **최근 250봉 캡** + 숫자 적정 반올림(압축). 문서 영속(자동저장)으로 재방문 시 재fetch 불필요(서버 캐시 병행). `불러오기` 재클릭=새로고침.
- **`priceSeries()` 확장**: ticker 노드의 fetched `series`를 최우선 소스로 추가(순서: ticker.series > price.series > 비전). → `hasRealSeries()` true. 캔들 OHLC용 헬퍼 `priceOHLC()` 신설(같은 노드의 `ohlc` 반환).
- 적용 후 `runForge()`/`renderChart()` → 캔들차트 + 작도 + 예측 갱신.

### 5.3 차트 기본화
- ticker fetched series가 있으면 `hasRealSeries()` true → `heroMode()` **chart** 우선. 티커 데이터가 있으면 이미지 워크플로 대신 **캔들차트가 주 화면**. 이미지(`heroImgId`)는 티커 fetch가 없을 때만(기존 동작 보존).

## 6. 캔들 렌더 (`fcDrawMainChart` 캔들 대응)

- 현재 `fcDrawMainChart(series, pred)`는 종가 **선**만 그린다. **OHLC(`priceOHLC()`)가 있으면 캔들**(상승=`#46c28e`/하락=`#e06a6a` 바디 + 심지)로 렌더하도록 확장. 기존 phasefold 패널 캔들 로직(`fcDrawMain`, ~1936행)의 캔들 드로잉을 차용·이식.
- `priceOHLC()`가 있으면 캔들, 없으면(비전 종가 시계열·붙여넣은 종가 등) 기존 **선** 폴백. y축·예측 콘·이음새("지금")·`_mainGeo` stash·줌/팬(`_heroZoom`)·DPR3은 그대로 → **작도·줌·해상도 개선이 전부 캔들 위에 적용**.
- `_mainGeo`는 종가 기준 좌표(작도 정합) 유지 — 캔들은 같은 좌표계에 OHLC만 추가 렌더.

## 7. 엔진 연동 (`run`/작도가 실데이터 사용)

- `currentData()`/`buildData()`는 이미 `priceSeries()` 종가로 `data.price`를 만든다 → §5.2의 `priceSeries()` 확장으로 ticker fetched 종가가 자동 반영(코어 `run()` 무변경). 캔들은 렌더 전용(`priceOHLC()`)이라 엔진은 종가만 사용 — 작도(`_drawEvidence`)도 `_fcLastData.price` 종가 사용, 그대로 정합.
- 비전(이미지 판독) 경로는 **티커 fetch 없을 때 폴백**으로 유지(회귀 0).

## 8. 영향 / 호환 / 비목표

- **배포 산출물**: `forge.html` + `forge-api.php`(+필요 시 `forge-core.js`). **불가침**: `forge_data.json`·`forge_images.json`·`forge_jobs.json`·`forge_td_key.txt`·`forge_ohlc_cache_*.json`(서버 산출/키). git `.gitignore`에 키·캐시 추가.
- 무키 상태에서도 **Stooq로 주식·지수·포렉스 일봉 즉시 동작**. 키 주입 시 암호화폐·광범위·tf 확장.
- 코어 변경은 **최소(가능하면 0)** — 데이터 주입 형식만 맞춤. 테스트 83/83 유지.
- 비목표(YAGNI): 실시간 틱·웹소켓·자동 폴링 갱신(불러오기 스냅샷+캐시), 분단위 인트라데이(일/주/월 우선), 다중 티커 비교, 종목 검색 자동완성, 라이트박스/서브패널 변경.
- 단일 HTML·바닐라 JS·무빌드·다크 토큰·한국어·noindex·POST<128KB 유지.

## 9. 단계 (플랜 분해 가이드)

1. **프록시**: `forge-api.php` `?ohlc=` 엔드포인트(Twelve Data+Stooq 폴백·정규화·캐시·키 파일). 라이브 curl 검증(무키=Stooq, 키=Twelve Data).
2. **캔들 렌더**: `fcDrawMainChart` 캔들 대응(+선 폴백). 외부 데이터 없이 합성/붙여넣은 OHLC로 검증 → **화질 문제 선해결**.
3. **티커 UI + fetch**: 가격 노드 입력·`불러오기`·`fetchOHLC`·노드 영속(캡·압축)·차트 기본화.
4. **엔진 연동**: `currentData()`가 노드 ohlc/series 사용 → 작도·예측 실데이터화. 헤드리스/라이브 검증.

## 10. 검증

- 프록시: cafe24 라이브 curl — 무키 시 `source:"stooq"` 주식 OHLC, 키 주입 시 `source:"twelvedata"` 주식+암호화폐, 미존재 심볼 502. 캐시 히트.
- 클라: forge.html 인라인 파싱(`new Function`)·코어 83/83. 헤드리스 — 티커 불러오기 후 캔들차트 렌더·작도 정합·줌/팬·예측 콘. 따옴표 위생.
- 에러 경로: 오프라인(SERVER_OK false)·미존재 심볼·무키 폴백 — 토스트·그레이스풀.
