# 머니스쿱 앱 — 진행 로그 · 재개 지점

**세션이 끊기면 이 문서 하나로 이어진다.** 페이즈 완료·배포·중요 결정 때마다 갱신한다(갱신 규칙은 맨 아래).
최종 갱신: **2026-08-24 (P3 완료 직후 · P4 시그널 착수 전)**

---

## 0. 지금 어디까지 왔나 (한눈)

| 페이즈 | 상태 | 핵심 |
|---|---|---|
| P0 골격 | ✅ | map/app/ 신설·토큰·정책(config)·상태·크롬·라우터 |
| P1 첫 90초 | ✅ | 온보딩 여정 + 기본 분석 **엔진 실계산** + 차트 v1 + 홈/분석 화면 v1 |
| P2 분석 코어 | ✅ | 3단계 전 동선·실행 연출(지표별 **실작도**)·PiP·작도 32종·2/3차 실좌표·**엔진 레지스트리 자동 확장**·전역 종목 시트 |
| P3 채점 | ✅ | 서버 원장(app-api/app-ledger-lib)·지연 채점·채점 화면 전체·라이브 검증 |
| P4 시그널 | ✅ | 감지 라이브러리(엔진 실계산·룰 8종)·피드 화면·읽음 배지(Q7) |
| **P5 경제** | ⏳ **다음** | 지갑 서버 연동(비용 2/3 개정·적중 환급 실지급)·XP/레벨/캐릭터 |
| P6 페르소나 / P7 통계 / P8 계정 / P9 마감 / P10 앱 셸 | — | BUILD-PLAN §7 |

**라이브**: https://parksvc.mycafe24.com/map/app/ (실데이터 — cafe24에서만 시세 프록시 동작. 로컬은 `?fixture=1`)

## 1. 새 세션 재개 절차

1. 이 문서 → [`BUILD-PLAN.md`](BUILD-PLAN.md)(아키텍처·모듈 맵·엔진 브리지 계약·Q1~12) → `map/CLAUDE.md` §앱 트랙(규칙 요약) 순으로 읽는다.
2. `cd map && ./tests/run.sh` — **882건 전체 초록이 기준선**(app 61 · app-ledger 21 포함).
3. 라이브 확인: 위 URL 부팅 + `curl -s -X POST https://parksvc.mycafe24.com/map/app-api.php -d '{"op":"list","device":"smoketest01"}'` → ok:true.
4. 마지막 커밋 로그(`git log --oneline -10`)와 이 문서 §5 세션 로그 대조 → 다음 항목 착수.
5. 상세 태스크 플랜: `docs/superpowers/plans/2026-08-24-app-p*.md` (P0·P1·P2 — 완료 헤더에 실행 중 조정사항 기록됨).

## 2. 절대 잊으면 안 되는 결정·규칙 (요약 — 원문은 BUILD-PLAN·CLAUDE.md)

- **정본 체계**: 프로토타입(동작) > 지침서(정책) > 치환표 > 구 시안(동결). 데이터 정본 = 스쿱 엔진.
- **열린 엔진 연계**: 지표 세트·개수·이름의 단일 출처 = `forge-core.indicatorRegistry`. 엔진에 지표 추가 → 모바일 자동 N+1(가짜 33번째 증명 테스트 `app/registry-sync.test.js`). 하드코딩 금지.
- **연출 = 엔진 실작도**(시안 샘플 흉내 금지 — 메모리 `app-show-real-engine-drawing`). 카메라는 viewBox 크롭(프레임 이탈 금지). 화면 요소는 #msApp 기준(fixed 금지).
- **차트·작도 품질 하한 = PC 웹 동일**(지속 개선 트랙).
- 확정: Q1 적중 환급 +1(P5 실지급) · Q2 레벨 0 시작 · Q3 24h 무차감 대칭 · Q4 페르소나 300문+·**총량 비공개** · Q5 지표는 엔진 정본.
- 정책 숫자는 `app-config.js` POLICY만 · 문자열은 `MS.str()` · ES2017 하한 · 시트는 탭바 불가림.

## 3. 배포 상태 (2026-08-24 기준)

- **앱**: `www/map/app/` — index.html·app.css·app-*.js(테스트 제외)·assets(intro/engine-deep/engine-apply.mp4).
- **서버 동반 세트**: `www/map/app-api.php` + `app-ledger-lib.php`(같이 올리고 같이 검증).
- **엔진**: 앱은 서버의 `www/map/forge-core.js` 를 상대참조 — **엔진 커밋 미배포 시 앱이 죽는다**(aggUpProb 사고, CLAUDE.md 기록). 엔진 올릴 땐 forge 동반 세트 확인.
- **불가침**: `<data>/app_ledger.db`(예측·채점 원장) + 기존 forge_*·wallet 목록.
- 배포 방법: `lftp -u "parksvc,<메모리 scoopforge-deploy 참조>" sftp://parksvc.mycafe24.com` → put.

## 4. 개발 환경 메모 (재개 시 그대로 씀)

- 로컬 서빙: `cd map && php -S 127.0.0.1:8931 -t .` (run_in_background). PHP에 curl 확장 없음 → 시세 프록시 불가 → 앱은 `?fixture=1`(결정적 합성 캔들+날짜, dev 전용·P9 제거 목록).
- 헤드리스: `LD_LIBRARY_PATH=~/.local/pwlibs/usr/lib/x86_64-linux-gnu NODE_PATH=~/.npm/_npx/705bc6b22212b352/node_modules node <script>` + playwright chromium(~/.cache/ms-playwright). E2E 스크립트 예시는 스크래치에 있었음 — 필요 시 재작성(여정: skip→start→data-sym→go→…).
- 실데이터 노드 검증: 프로덕션 OHLC를 curl로 받아 `require('./app-engine.js')`로 직접 분석(읽기 전용 GET은 허용 — 메모리 headless-live-tests-readonly).
- 프로토타입 열람: `docs/design-v2/raw/handoff-1/`(gitignore — 없으면 git 이력 e0e0727의 zip 2개를 다시 풀 것). 해부 3부작 `dissection/01~03`(줄 번호 인용) 필독.

## 5. 세션 로그 (아래로 append)

### 2026-08-24 — 인테이크 → P3 (한 세션)
- 시안2 zip 수령·해부 3부작·BUILD-PLAN 작성. P0(골격 826건) → P1(첫 90초·엔진 실계산·NVDA 5,026봉 검증·라이브 배포+엔진 서버 뒤처짐 사고 수습) → P2(분석 코어·PC 작도 패리티·사용자 피드백 2회 반영: ①실작도/프레임/FAB 수정 ②**엔진 레지스트리 자동 확장** 신설) → P3(채점 원장 서버+화면·라이브 검증). 관문 882건.
- 사용자 확정 누적: Q1·Q2·Q3·Q4(300문+·총량 비공개)·Q5 + 차트 품질 하한(PC 동일) + 열린 엔진 연계.
- P4 시그널 완료(같은 날): app-signals(UMD·룰 8종 — 거래량 배수·갭·볼린저 이탈·신고/신저가·RSI 진입·MACD 교차·20일선 돌파·변동성 확대, 임계는 TH — 리모트 컨피그 대상), sig 화면·읽음 영속·배지·홈 히어로. 통계 문구('표본 N건')는 실측 축적 전이라 미표기(지어내지 않음). 관문 889건.
- **다음 착수점: P5 경제** — 지갑 서버 연동(wallet 3종 재사용: 비용 full3/custom5 → deep2/custom3 개정 + XP/레벨 테이블 신설), 클라 차감/환불의 서버 트랜잭션 전환(멱등키), 적중 환급 실지급(al_claim_refunds 와 원자 결합), 출석·연속7일·광고(AdMob는 P10), XP 적립 훅(visitXp·채점/시그널 확인·레벨업 오버레이·캐릭터), wallet 화면. **배포 전 `./tests/run.sh concurrency` 필수**(wallet-lib 수정 시).

---

## 갱신 규칙 (Claude 작업 규율)

- **페이즈 완료·배포·사용자 확정이 있을 때마다** §0 표·§3·§5 로그를 갱신하고 같은 커밋에 포함한다.
- 세션이 길어지면 중간에도 §5에 "진행 중 지점"을 남긴다(다음 파일·다음 태스크 명시).
- 이 문서는 요약이다 — 상세는 BUILD-PLAN·플랜 문서·CLAUDE.md 가 정본이며 어긋나면 그쪽을 고친다.
