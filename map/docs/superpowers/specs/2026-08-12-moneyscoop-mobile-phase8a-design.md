# 머니스쿱 모바일 Phase 8a — 지갑 클라이언트 계약 + UI

- 날짜: 2026-08-12
- 대상: `map/mobile/www/wallet.js`(신규) · `wallet-local-stub.js`(신규) · `screens/wallet.js`(신규) · `tier-sheet.js`(신규) · `screens/report.js` · `screens/watchlist.js` · `app.js` · `store.js` · `strings.js` · `style.css` · `index.html`
- 선행: [`2026-08-12-moneyscoop-mobile-phase7-design.md`](2026-08-12-moneyscoop-mobile-phase7-design.md) · 대조 근거 [`../../../mobile/docs/design-audit.md`](../../../mobile/docs/design-audit.md)
- 시안 출처: `mobile/docs/design_handoff/` — **`SPEC-economy.md`(권위 출처)** · 목업 `2c`(지갑·스트릭) · `7a`(단계 선택) · `4a`(Core→Full) · `5a`(티어 명칭) · `11a`(확정 사양)
- 상태: 설계 승인됨 (2026-08-12)

## 1. 배경 — "재화 체계"는 한 페이즈가 아니다

`design-audit.md` 가 재화를 가장 큰 공백으로 지목했다(화면 5개가 여기 묶여 있다). 그런데 `SPEC-economy.md` 를 읽으면 이것이 **최소 넷의 하위 프로젝트**임이 분명해진다.

| | 하위 프로젝트 | 선행 조건 |
|---|---|---|
| **8a**(본 문서) | 지갑 클라이언트 계약 + UI | 없음 |
| 8b | 서버 원장 — SQLite + `forge-api.php` wallet ops | ⚠️ cafe24 SQLite(PDO) 가용 여부 확인 중 |
| 8c | 구글 로그인 + 익명 계정 병합 | 8b |
| 8d | AdMob SSV — 광고 유닛 2종 · 서명 검증 | ⚠️ Android 빌드 미검증 · AdMob 계정 |

백로그가 이미 `v2 — 서버 지갑 + 구글 로그인` / `v3 — AdMob + SSV` 로 갈라 둔 판단과 같다.

## 2. `SPEC-economy.md` 가 정한 것 (양보 불가)

> **원장은 서버에 산다. 항상.** 클라이언트가 잔량을 들면 출시 1주일 안에 조작된다 — WebView 의 `localStorage` 는 루팅된 기기에서 쉽게 닿고 Capacitor 저장소도 다르지 않다. 더 나쁜 건, 클라이언트가 보상을 주면 앱이 "광고를 봤다"를 스스로 판정하는 셈이고 그게 정확히 AdMob 의 어뷰징 탐지 대상이다.

- 클라이언트는 **잔량도 델타도 "광고 봤다"도 보내지 않는다.** **의도**(`spend`)와 **신원**만 보내고 서버가 계산해 권위 있는 잔량을 돌려준다
- **spend 는 멱등해야 한다.** 모바일망은 재시도한다. `idem` 없이는 한 분석에 두 번 과금되고 *"두 번 청구된 사용자는 앱을 지운다"*
- **차감과 실행은 한 트랜잭션.** 낙관적 차감 금지
- 상한·쿨다운·시간은 **전부 서버 판정**
- 보상은 **AdMob SSV**에서. `onAdDismissed` 에 주지 말 것

SPEC 이 *"되돌리기 어려운 둘"* 로 지목한 것이 **원장의 위치**와 **보상 경로**다. 8a 의 존재 이유는 그 둘을 나중에 붙일 수 있는 모양으로 클라이언트를 짜는 것이다.

## 3. 계약 — 서버가 이미 있는 것처럼 짠다

```js
MSWallet.get()                 → Promise<State>
MSWallet.spend(runType, idem)  → Promise<{ ok, state, reason }>
MSWallet.refund(idem)          → Promise<{ ok, state }>
MSWallet.checkin()             → Promise<{ ok, state, granted, reason }>
MSWallet.install(backend)      // 8b 가 이 한 줄로 갈아끼운다

State = { balance, cap, streakDays, canCheckin }
```

**처음부터 지키는 규칙 넷:**

1. **클라이언트는 잔량도 델타도 계산하지 않는다.** 화면은 백엔드가 준 `state` 만 그린다. `balance - 3` 같은 코드가 어디에도 없어야 한다 — 유일한 예외가 §5.3 의 차감 **미리보기**이고 그것은 표시 전용이다
2. **모든 `spend` 에 `idem`(uuid).** 같은 `idem` 이 다시 오면 백엔드가 **같은 결과를 재현**하고 두 번 차감하지 않는다
3. **차감과 실행이 한 쌍.** `spend` → 분석 실행 → 실패하면 `refund(idem)`
4. **전부 비동기.** 지금은 로컬이라 즉시 돌아오지만 화면은 대기 상태를 처리하도록 짠다

`runType` 은 SPEC §1 의 어휘를 그대로 쓴다 — `'full' | 'custom' | 'slot' | 'scan'`.

**백엔드는 자기 자신을 설치한다.** `wallet-local-stub.js` 가 로드되면서 `MSWallet.install(...)` 을 부르고 경고를 한 번 찍는다. 그래서 **8b 의 교체는 `index.html` 의 스크립트 태그 한 줄을 바꾸는 일**이 된다. 백엔드가 없으면 `MSWallet` 의 모든 호출이 `{ok:false, reason:"no-backend"}` 로 떨어지고 화면은 필을 비운다 — 죽지 않는다.

**필은 비동기로 채워진다.** `MSWallet.get()` 이 돌아오기 전에는 잔량 자리가 비어 있다가 값이 오면 채워진다. 지금은 로컬이라 즉시지만 8b 에서는 네트워크다.

### 3.1 가격은 셋만 매긴다

```
full: 3 · custom: 5 · slot: 1 · scan: 0(무료)
```

`full`·`custom` 은 `5a`·`4a` 가 명시했고 `slot` 은 `2b` 의 *"Add TSLA to watchlist — Costs 1 Scoop"* 에서 온다. **`scan` 은 가격이 시안 어디에도 없다.** `SPEC §1` 의 `runType` 목록과 `2c` 의 Spend 목록(`Watchlist signal scan`)에 이름만 있다.

스캔은 워치리스트의 기본 동작이라(6종목이면 6회) 값을 임의로 정하면 제품 결정을 대신하는 셈이다. **무료로 두고 백로그로 넘긴다.**

## 4. 스텁 백엔드 — 격리하고, 나중에 삭제한다

8a 는 `wallet-local-stub.js` 한 파일에 개발용 백엔드를 둔다. `MSStore` 뒤에 상태를 저장하고 상한 20 을 강제한다.

**저장 모양은 서버 스키마를 축소해 흉내낸다** — `SPEC §1` 의 `accounts` + `ledger` 를 각각 하나씩:

```js
{ balance, streakDays, lastCheckin,           // accounts 에 대응
  entries: [ { idem, delta, reason, at } ] }   // ledger 에 대응
```

`entries` 가 멱등과 롤백을 **동시에** 떠받친다 — 같은 `idem` 이 이미 있으면 그때의 결과를 재현하고, `refund(idem)` 은 반대 부호의 줄을 하나 더 쌓는다. 잔량은 `balance` 캐시를 쓰되 `entries` 합과 어긋나지 않아야 한다(SPEC 이 서버에 요구한 것과 같은 구조).

> ⚠️ **이 스텁은 프로덕션에 나가면 안 된다.** `SPEC §1` 이 경고한 바로 그 상태(클라이언트가 잔량을 든 상태)이고, **8b 가 이 파일을 대체하기 전에는 출시 불가**다. 파일명 · 최초 1회 콘솔 경고 · 백로그 세 곳에 남긴다.

### 4.1 스텁이 못 하는 것 — 기록해 둔다

- **출석 판정이 기기 시계를 쓴다.** `SPEC §3` 이 *"기기 시계를 바꾼 사용자가 아무것도 못 얻어야 한다"* 고 했는데 로컬에선 불가능하다. 8b 의 서버 시간으로 해소된다
- **재설치하면 잔량이 초기화되고 5개를 다시 받는다.** `SPEC §4` 가 *"출시 시점 가장 유력한 어뷰징 경로"* 로 지목한 것이다. `device_id` 기반 중복 차단은 서버 몫이다

### 4.2 8b 는 교체가 아니라 삭제다

8b 의 서버는 PHP 라 같은 규칙(상한·스트릭·멱등)을 다시 쓴다. **두 벌이 생기면 갈린다** — 이 저장소가 그 문제로 다섯 번 당했다(Phase 3 상태 어휘 · Phase 4 `plotWidth` · Phase 5 브레이크포인트 · Phase 6 확률 수학 · Phase 7 칩 상태).

그래서 **8b 는 `wallet-local-stub.js` 를 지운다.** 규칙이 서버 한 곳에만 남는다. 8a 의 스텁 테스트도 그때 함께 사라진다.

## 5. 화면과 흐름

### 5.1 스쿱 필

워치리스트 헤더와 리포트 헤더에 상시 노출한다. 탭하면 지갑 화면.

**워치리스트 헤더가 바뀐다** — Phase 7 이 만든 `◆ MoneyScoop  ( ● Scan )` 에 필을 더하면 411px 에 넷이 된다. **`Scan` 을 아이콘 버튼(`↻`)으로 줄이고 필을 넣는다.** 스캔 중에는 `Scanning 3/6` 으로 폭이 늘어난다.

> **시안 충돌 기록**: 목업 `1a` 의 워치리스트 헤더에는 스쿱 필이 없다(우상단이 `Scan`). 그러나 `11a` 확정 사양이 *"우상단 스쿱 필 상시"* 를 명시하고, `2c` 해설이 *"광고를 '당해서' 보는 게 아니라 모으려고 보게 만드는 구조"* 라고 적었다 — 잔량이 안 보이면 모을 이유가 안 생긴다. **이번엔 텍스트 쪽에 제품 논리가 붙어 있어 11a 를 따른다.**

### 5.2 지갑 화면 (신규 라우트)

시안 `2c`:

```
Scoops                     Cap 20
   5
Earn    Quick ad 15s    +1   [비활성 · 8d]
        Full ad 30s     +3   [비활성 · 8d]
        Daily check-in  +1   [동작]
        Week 7 chest    +5   Day 4 · 3 days away
Spend   Add a ticker slot         1
        Deep analysis             3
        Parameter optimiser       5
```

광고 둘은 **비활성 + "곧 제공"**. 8d 가 오기 전엔 눌러도 아무 일이 안 일어나는 것이 정직하다.

**2단(폴드)에서는 지갑이 오른쪽 칸(리포트 자리)에 뜨고 목록은 유지된다.**

### 5.3 단계 선택 바텀시트

시안 `7a` 가 *"A bottom sheet"* 로 명시했다. 리포트의 현재 비활성 CTA 자리에서 열린다.

```
Basic   5 indicators · daily only          Free · done
Full    All 32 indicators                  5 → 2
Custom  All 32 + your weights              5 → 0     [비활성 · v4]
        [ Run Full · 3 Scoops ]
```

`5 → 2` 는 **현재 잔량에서 계산한 표시 전용 미리보기**다(§3 규칙 1의 유일한 예외). 실제 차감은 서버가 한다.

**잔량이 부족하면** 버튼이 비활성이고 *"Come back tomorrow for +1"*(출석) 안내가 붙는다. **광고가 8d 라 그것이 유일하게 정직한 경로다.**

### 5.4 Full 결과 — 32지표 × 일·주·월

기존 리포트를 `TIER = "full"` 로 다시 그린다.

- `Not counted` 27 → **0**, `Counted` 5행 → **32행**
- 예측선 p3 잠금 해제 — `MSChartDraw.linesFor(TIER)` 가 **이미 티어별 게이팅을 하고 있어** 배선이 작다
- 확신 재계산 — 32지표 그래프의 `prediction` 으로 `MSReportModel.confidence()` 를 다시 부른다
- **주기 행이 실제 값으로 채워진다** — 지금은 `Weekly`·`Monthly` 가 `locked` 자리표시자다

엔진은 `MSGraph.full32Graph(ForgeCore)` 가 이미 있다. Basic 이 거기서 노드를 덜어내 만들어지므로 Full 실행은 그래프만 바꾸면 된다.

**세 주기를 각각 돌린다.** `MSApi` 가 이미 `1week`(최소 120봉)·`1month`(최소 60봉)을 지원한다. 시세 3건은 병렬로 받는다.

주기 행은 시안 `2a` 형태다:

```
Daily     Advance   68%   170.70
Weekly    Advance   61%   178.40
Monthly   Range     52%   184.00
```

`phase` 는 `verdict.regime`, `prob` 는 그 주기의 `confidence()`, `target` 은 `verdict.target` 이다. 그리고 시안 `6a` 의 `Timeframes agreeing 2 of 3` — 일봉 판정과 같은 방향인 주기 수를 센다.

> **`phase` 표기는 `strings.js` 가 단일 출처다.** 모델은 `regime` 키를 돌려주고 화면이 `Advance`/`Decline`/`Range` 로 옮긴다. Phase 7 에서 그룹 칩 라벨을 같은 이유로 화면 쪽에 뒀다.

### 5.5 실패 경로

**일봉이 실패하면 `refund(idem)`.** 보여줄 것이 아무것도 없다. 낙관적 차감을 하지 않는다는 `SPEC §1` 의 요구를 클라이언트에서 지키는 방법이다.

**주·월이 없으면 차감을 유지하고 그 행에 사유를 적는다.** `api.js` 가 주봉 120개·월봉 60개 미만이면 `not enough bars` 로 던지는데, **상장한 지 얼마 안 된 종목은 월봉 60개(=5년)가 없다.** 흔한 경우다.

3스쿱이 사는 것의 본체는 **27개 지표가 붙는 것**이고(`4a` 의 *"What the 27 added"*), 주·월은 그 위의 추가다. 신규 상장주라고 Full 을 아예 못 사게 하면 그 종목은 영원히 Basic 이고, 전체를 실패시키면 살 수 있는 것도 못 사게 된다.

**대신 빈칸으로 두지 않는다.** `Not enough history` 처럼 **왜 없는지**를 그 행에 적는다. 빈칸이나 `locked` 로 두면 *"돈 냈는데 안 준다"* 로 읽힌다 — `8a` 보드가 세운 *"모를 때는 모른다고 말하기"* 와 같은 태도다.

## 6. 파일 분해

| 파일 | 책임 | 테스트 |
|---|---|---|
| **`www/wallet.js`** 🆕 | `MSWallet` 계약 — 백엔드 위임 · 비용표 · 상태 정규화 · `idem` 생성 | ✅ |
| **`www/wallet-local-stub.js`** 🆕 | **개발용 백엔드**. 8b 가 **삭제**한다 | ✅ |
| **`www/screens/wallet.js`** 🆕 | 지갑 화면 | 배선 |
| **`www/tier-sheet.js`** 🆕 | 단계 선택 바텀시트 | 배선 |
| `www/report-model.js` | **확장** — `tfRows(FC, runs)` · `agreeCount(runs)`(주기 행·동의 수, 순수) | ✅ |
| `www/screens/report.js` | 티어 상태 · 시트 진입 · Full 재실행(3주기) · 필 | 배선 |
| `www/screens/watchlist.js` | 헤더에 필 + `Scan` 아이콘화 | 배선 |
| `www/app.js` | `wallet` 라우트 | 배선 |
| `www/store.js` | 지갑 저장 키 | 기존 테스트 |
| `www/strings.js` · `style.css` · `index.html` | | |
| `mobile/docs/BACKLOG-mobile.md` | 종료 기록 · 확인 항목 · 이월 | |

## 7. 테스트 — 화면이 아니라 규칙에

스텁 백엔드의 판정에 붙인다. `MSStore.install(memBackend())` 가 이미 있어 메모리 저장소 위에서 돌릴 수 있다.

- **멱등**: 같은 `idem` 으로 두 번 `spend` → **한 번만 차감**되고 같은 결과가 재현된다
- 잔량 부족 → `ok:false`, **잔량 불변**
- 상한 20 초과 지급 → **절삭**되고 그 사실이 결과에 담긴다
- 출석: 하루 1회 · 연속일 증가 · 하루 건너뛰면 리셋 · 7일차 +5
- 비용표 `full:3 · custom:5 · slot:1`, `scan` 은 과금 없음
- 롤백: `spend` 후 `refund` 하면 잔량이 원복되고 원장에 두 줄이 남는다

`MSReportModel` 확장분:
- `tfRows` — 세 주기가 다 있을 때 3행 · 주/월이 없으면 그 행에 사유가 담긴다 · 일봉만 있어도 1행은 나온다
- `agreeCount` — 일봉 판정과 같은 방향인 주기 수. 셋 다 같으면 `3 of 3`, 주/월이 없으면 분모가 준다

**기대값은 리터럴로.** 구현 상수를 읽어 기대값을 만들면 항등식이 된다 — Phase 3·4·5·6·7 에서 다섯 번 재발했다.

관문은 `map/tests/run.sh`. 이번 Phase 는 엔진을 건드리지 않으므로 `forge-core` 259 · `forge-tools` 81 · `landing` 28 은 변동 없어야 한다.

## 8. 범위 밖

- **8b 서버 원장 · 8c 구글 로그인 · 8d AdMob SSV** — 별도 하위 프로젝트
- **Custom 티어**(5스쿱) — 시트에 자리만 잡고 **비활성**. 화면군 자체가 v4
- **`scan` 과금** — 가격이 시안에 없다(§3.1)
- **광고 화면**(`2b`) — 8d
- **온보딩 5개 지급** — 온보딩 페이즈. 8a 는 스텁이 첫 사용 시 5개를 시드해 그 자리를 임시로 메운다

## 9. 실기기 확인이 필요한 항목

1. 워치리스트·리포트 헤더에 스쿱 필이 뜨고 탭하면 지갑이 열린다
2. `Scan` 이 아이콘으로 줄었는데도 누르기 불편하지 않다(스캔 중 `Scanning 3/6` 로 늘어나는 것 포함)
3. 출석 체크인이 하루 1회만 되고 스트릭이 는다
4. 단계 선택 시트에서 `5 → 2` 미리보기가 현재 잔량과 맞는다
5. **Full 실행이 체감상 얼마나 걸리는가** — §10 의 미실측 항목
6. Full 결과에서 `Not counted` 가 0 이 되고 `Counted` 가 32행이 되며 예측선 p3 가 보인다
6-1. 주기 행이 `Daily`·`Weekly`·`Monthly` 모두 실제 값으로 차고, `Timeframes agreeing N of 3` 이 맞는다
6-2. **월봉 이력이 짧은 종목**(최근 상장주)에서 그 행에 `Not enough history` 사유가 뜨고 **차감은 유지**된다
7. 잔량 부족 시 버튼이 비활성이고 출석 안내가 뜬다
8. 2단에서 지갑이 오른쪽 칸에 뜨고 목록이 유지된다

## 10. 열린 항목

- **Full 실행 시간이 미실측이다.** Phase 1 실측은 *"Basic 5지표는 데스크톱 5031봉 약 20.2ms, Full 32지표 대비 약 128배 저렴"* — 데스크톱에서 Full 이 약 2.6초라는 뜻이다. 모바일은 봉 수가 훨씬 적지만 실측이 없다.
  **세 주기를 돌아도 3배가 아니다** — 엔진 비용이 봉 수를 따라가는데 일봉 220+ · 주봉 120 · 월봉 60 이라 합이 약 1.3배다. 시세 3건은 병렬로 받는다. 구현 중 폰에서 재고, 체감되면 시트에 진행 표시를 붙인다
- **스텁의 규칙이 8b 의 PHP 와 갈릴 수 있다** — §4.2 의 "삭제" 로 막지만, 8b 를 쓰는 사람이 그 결정을 알아야 한다
- **`scan` 가격** — §3.1
- **재설치 어뷰징** — §4.1. 서버 몫
