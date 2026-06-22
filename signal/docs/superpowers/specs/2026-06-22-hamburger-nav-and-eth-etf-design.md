# 모바일 햄버거 네비 + 사이드 컴팩트 + ETH ETF 발행사별 설계 문서

- 작성일: 2026-06-22
- 대상: `signal/scoopsignal.html` (단일 정적 HTML) + 신규 `signal/etf.php`(cafe24 프록시)
- 성격: Part A(네비 UX, 프론트) + Part B(ETF 발행사별 + cafe24 PHP 프록시). 점수 산식 불변.

## 1. 배경 / 목적

- 모바일·폴드 해상도에서 사이드바를 가로 pill 바로 처리 중인데 별로다 → **햄버거 드로어**로 개편.
- 항목이 더 늘어날 예정 → 사이드 항목 높이 **컴팩트화**.
- 현재 "기관 ETH 보유"(CoinGecko, 상장사 트레저리)와 별개로 **ETH 현물 ETF 발행사별**(BlackRock·Fidelity·Grayscale·ARK 등) 데이터 메뉴 추가. ETF 발행사 데이터는 무료·CORS·노키로 직접 불가 → **cafe24 PHP 프록시**(서버 사이드 fetch)로 우회(사용자 확정: cafe24, Cloudflare 불필요).

## 2. 목표

**Part A (프론트, 먼저)**
- ≤900px에서 사이드바를 **햄버거 off-canvas 드로어**로(가로 pill 제거). 헤더 ☰ 버튼, 좌측 슬라이드인 + 백드롭, 항목/백드롭/ESC로 닫힘. 데스크톱(>900px) 기존 고정 사이드바 유지.
- `.snav-item` 패딩·폰트 소폭 축소(컴팩트).

**Part B (프록시 포함, 다음)**
- `signal/etf.php` — cafe24 서버에서 ETF 소스(Farside 주)를 받아 CORS JSON 반환.
- 신규 뷰 `etf`("기관·플로우" 그룹, Basic): 발행사별 ETH ETF 막대 + 총합 + (가용 시) 일일 순유입. 프론트는 동일 호스트 `./etf.php` fetch, 미배포/실패 시 "연결 필요".

## 3. 비목표 (YAGNI)

- Cloudflare. 점수 편입. ETF 외 새 프록시. jsiy 등 기존 서버 데이터 수정(etf.php만 추가).

## 4. Part A 설계 — 햄버거 + 컴팩트

### 4.1 햄버거 드로어 (≤900px)

- 헤더(`.top-bar`) 좌측에 `<button class="hamb" id="hambBtn">`(☰ SVG). 데스크톱(>900px)에선 `display:none`.
- `.app` 의 `.side`를 ≤900px에서 **off-canvas**: `position:fixed; left:0; top:0; height:100vh; width:280px; transform:translateX(-100%); transition; z-index:40; overflow-y:auto`. 열림 = `.side.open{transform:none}`.
- 백드롭 `.side-backdrop`(fixed 전체, 반투명, z-39), 열림 시 표시.
- 토글: `hambBtn` 클릭 → `.side.open` + 백드롭 on. 닫힘: 백드롭 클릭 / `.snav-item` 클릭(뷰 전환 후) / ESC. body 스크롤 잠금(`overflow:hidden`)은 열림 동안.
- **현재 ≤900px 가로 pill CSS 제거/대체**: `.snav` 세로 유지(드로어 안), `.snav-group` 표시(드로어에선 그룹 보임). 데이터 상태 푸터도 드로어 안에 포함.
- 데스크톱 레이아웃·동작 변화 없음(햄버거 숨김, 사이드바 고정).

### 4.2 컴팩트 항목

- `.snav-item` 패딩 `6px 9px → 5px 9px`, 폰트 `12.5 → 12px`, `.snav` gap 유지/축소, 아이콘 `15 → 14px`. (소폭, 가독성 유지.)

## 5. Part B 설계 — ETF 발행사별 + etf.php

### 5.1 cafe24 `etf.php` (서버 프록시)

- 위치: `www/portal/signal/etf.php` (scoopsignal.html과 같은 디렉토리).
- 동작: 서버 사이드 `file_get_contents`/cURL로 ETF 소스 취득 → 발행사별 파싱 → JSON. `Access-Control-Allow-Origin: *`, `content-type: application/json`. 단순 파일 캐시(예: `etf_cache.json`, 30분 TTL)로 소스 부하·속도 완화.
- 소스(주): **Farside** ETH ETF 흐름/보유 페이지(HTML) 파싱 → 발행사 행 추출. 실패 시 SoSoValue 등 폴백 또는 빈 배열.
- 반환 형태:
  ```json
  {"asOf":"2026-06-22","total":<억$ 또는 ETH>,"unit":"usd|eth",
   "issuers":[{"name":"BlackRock (ETHA)","ticker":"ETHA","value":<숫자>,"flow1d":<일일 순유입 또는 null>}, ...]}
  ```
- **cafe24 WAF 주의(메모리)**: 정적 파일 내 `<?` 리터럴은 500 — etf.php는 실행 PHP라 무관하나, 출력에 `<?` 미포함. jsiy 서버 데이터 불가침(etf.php만 추가, 다른 파일·데이터 미수정).

### 5.2 프론트 — `loadEtf()` + `etf` 뷰

- `loadEtf()`: `./etf.php`(상대경로, 동일 호스트) fetch → `S.etf={total,unit,issuers,asOf}|null`. try/catch → null + `setStatus('etf','warn')`. 캐시 20분(`S._etfAt`). `refresh()` allSettled 추가, 상태 `#st-etf` "ETF".
- 사이드 "기관·플로우" 그룹에 `etf` 항목(듀오톤 아이콘) 추가. CHART_TIER `etf:'basic'`.
- 뷰 `etf`: `.page-head`(총합·기준일 `#etfStats`) + `.ob-bars #etfList`(발행사별 막대, 보유/순자산 + flow1d). `renderEtf()` — `S.etf` 없으면 "연결 필요(etf.php 배포 후)". recompute에서 호출, 사이드 배지(총합/순유입).
- 로컬(file://·localhost)에선 `./etf.php` 없어 "연결 필요" 표시 — 정상(라이브 cafe24에서만 동작).

## 6. 그레이스풀 / 검증 환경

- etf.php 미배포·실패 → etf 뷰 "연결 필요", 나머지·점수 정상.
- Part A는 헤드리스로 모바일(≤900px) 드로어 동작·데스크톱 무변화 검증.
- Part B는 **etf.php를 cafe24에 배포한 뒤 라이브에서** `curl .../signal/etf.php`로 JSON·발행사 파싱 확인(로컬 헤드리스론 etf.php 부재라 "연결 필요"만 확인). Farside 파싱이 깨지면 etf.php 셀렉터 조정.

## 7. 엣지/주의

- 디자인 토큰만, `html{zoom:1.35}` 유지, 한국어, 좌측 컬러바 금지(아이콘 면·햄버거는 버튼). 2 spaces.
- 드로어 z-index: 헤더(z-20)보다 위(드로어 40·백드롭 39). 햄버거 버튼은 헤더 안.
- ESC·백드롭·항목 클릭 닫힘 + body 스크롤 잠금/해제 정확히.
- etf.php 캐시 파일 쓰기 권한(cafe24 PHP 쓰기 가능 — 메모리). 캐시 실패해도 동작(캐시는 최적화).
- `S.etf` 형태(issuers 배열·value 단위)를 renderEtf·배지가 일관 소비.

## 8. 검증

- **Part A**: 헤드리스 390px — ☰ 클릭 시 드로어 슬라이드인 + 백드롭, 항목 클릭→뷰 전환+닫힘, ESC/백드롭 닫힘. 1280px — 햄버거 숨김·사이드바 고정 무변화. 가로 pill 제거 확인. 항목 높이 축소 육안. JS 에러 0.
- **Part B**: etf.php 라이브 배포 후 `curl` JSON(issuers 배열) 확인. 프론트 etf 뷰 발행사 막대·총합 표시(라이브). 로컬은 "연결 필요" 정상. 기존 점수·차트 회귀 0.
- 스크린샷 육안(드로어·etf 뷰).
