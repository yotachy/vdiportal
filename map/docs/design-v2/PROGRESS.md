# 머니스쿱 앱 — 진행 로그 · 재개 지점

**세션이 끊기면 이 문서 하나로 이어진다.** 페이즈 완료·배포·중요 결정 때마다 갱신한다(갱신 규칙은 맨 아래).
최종 갱신: **2026-08-28 (마스터-디테일 · 추세선 작도 정비 · 캐시버스터 조용한 실패 수습)**

---

## 0. 지금 어디까지 왔나 (한눈)

| 페이즈 | 상태 | 핵심 |
|---|---|---|
| P0 골격 | ✅ | map/app/ 신설·토큰·정책(config)·상태·크롬·라우터 |
| P1 첫 90초 | ✅ | 온보딩 여정 + 기본 분석 **엔진 실계산** + 차트 v1 + 홈/분석 화면 v1 |
| P2 분석 코어 | ✅ | 3단계 전 동선·실행 연출(지표별 **실작도**)·PiP·작도 32종·2/3차 실좌표·**엔진 레지스트리 자동 확장**·전역 종목 시트 |
| P3 채점 | ✅ | 서버 원장(app-api/app-ledger-lib)·지연 채점·채점 화면 전체·라이브 검증 |
| P4 시그널 | ✅ | 감지 라이브러리(엔진 실계산·룰 8종)·피드 화면·읽음 배지(Q7) |
| P5 경제 | ✅ | 지갑 서버 트랜잭션(deep2/custom3·멱등·환불)·적중 환급 실지급·출석/연속7·XP 시스템(게스트 잠금)·레벨업/캐릭터·내 스쿱 화면 |
| P6 페르소나 | ✅ | 서버 질문 은행(총량 비공개·확장형)·홈 카드(즉시 질문·풀 배급·고치기·게스트 3문 잠금)·정밀도 단계·16축 레이더·커스텀 보정(Q14 기준선 ±15%·내역 정직 표기)·내 성향 프리셋 추천·시그널 골드 우선 |
| P7 통계 | ✅ | 서버 익명 집계(al_peers_stats — 원장 실값만 파생)·peers 화면 8블록·엔진 카드 4페이지(백테스트 정본 58.1%/기준선 60.8% 병기·validatedAxes/version 라이브)·표본 없는 항목 '집계 준비 중' 정직 표기·마니페스토(about) 시트 |
| P8 계정 | ✅ | 실 구글 OAuth(wallet-auth.php+w_merge 재사용 — auth_start/auth_poll)·게스트→계정 병합(서버 규칙: xp/페르소나 max·읽음/종목 합집합)·닉네임 자동 생성·XP 실적립 게이트 해제·변경 디바운스 push+부팅 pull·로그아웃/탈퇴·계정 해석 3갈래(최초 링크/병합-이동 기기/게스트) |
| P9 마감 | ✅ | 반응형 §16 3단계(compact/medium 2패널·480 다이얼로그/expanded 좌측 레일)·접근성(tablist·dialog·Esc·포커스·aria-label)·fixture 로컬 호스트 게이트·앱 버전 상수·닉네임 리더보드 해금(적중·다작) |
| P10 앱 셸 | ✅ | `app-shell/` Capacitor 8 안드로이드 셸(APK 빌드 성공 · 엔진은 서버 절대 URL — 사본 없음)·AdMob 보상 광고 배선(app-ads.js ↔ ad_config/ad_state ↔ wallet-ssv 실지급)·하드웨어 뒤로가기·빌드/광고 활성/릴리스 절차 문서 |
| **다음** | — | **활성화 러너북 = [`LAUNCH.md`](LAUNCH.md)**(4기능 켜는 순서·포맷·검증 단일 출처). 외부 자원 대기: ① OAuth `forge_google_oauth.json`(웹 turnkey) · ② AdMob 유닛(SSV 404 수습 완료 — 콘솔+`ad_units.json`만) · ③ FCM(**Phase 1 구축 완료 2026-08-27** — Firebase 게이트만 남음) · ④ 서명 키. 코드 트랙은 이월·지속 개선(작도 PC 동조) |

**라이브**: https://parksvc.mycafe24.com/map/app/ (실데이터 — cafe24에서만 시세 프록시 동작. 로컬은 `?fixture=1`)

## 1. 새 세션 재개 절차

1. 이 문서 → [`BUILD-PLAN.md`](BUILD-PLAN.md)(아키텍처·모듈 맵·엔진 브리지 계약·Q1~12) → `map/CLAUDE.md` §앱 트랙(규칙 요약) 순으로 읽는다.
2. `cd map && ./tests/run.sh` — **1003건 전체 초록이 기준선**(2026-08-27 · app 96 · scan 10 · app-push 14 · app-ledger 40 · app-sync 26 포함). wallet-lib 을 만졌으면 `./tests/run.sh concurrency` 도.
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

## 3. 배포 상태 (2026-08-25 기준 — P10까지 라이브 · APK 는 로컬 빌드만)

- **앱**: `www/map/app/` — index.html·app.css·app-*.js(테스트 제외)·assets(intro/engine-deep/engine-apply.mp4).
- **서버 동반 세트**: `www/map/app-api.php` + `app-ledger-lib.php` + `app-wallet-bridge.php` + `app-persona-bank.php`(P6) + `app-sync-lib.php`(P8) + `app-push-lib.php`(푸시 Phase 1) + `wallet-lib.php`(가드형 상수 — 같이 올리고 같이 검증, wallet-lib 수정 시 concurrency 관문 필수).
- **엔진**: 앱은 서버의 `www/map/forge-core.js` 를 상대참조 — **엔진 커밋 미배포 시 앱이 죽는다**(aggUpProb 사고, CLAUDE.md 기록). 엔진 올릴 땐 forge 동반 세트 확인.
- **불가침**: `<data>/app_ledger.db`(예측·채점 원장) · `app_push.db`(푸시 등록부) · `app_scan_key.txt` · `app_fcm.json` + 기존 forge_*·wallet 목록. `map/scan/` 은 cafe24 배포 대상 아님(외부 cron 호스트).
- **앱 셸(APK)**: `map/app-shell/` — 스토어 릴리스 트랙(커밋+푸시 한 세트, 배포 별도). 절차·릴리스 준비 목록은 `docs/ANDROID-BUILD.md` 하단 절. 디버그 APK 44MB(인트로 mp4 3종 포함 — 릴리스 전 R8·에셋 다이어트 과제).
- **⚠ 캐시버스터 필수(2026-08-25)**: cafe24 가 css/js 를 `max-age 604800`(7일)로 캐시한다 — **버전 쿼리 없이 배포하면 돌아온 사용자가 7일간 옛 파일을 본다**(작도·수정이 안 먹던 실제 원인). app/index.html·forge.html 은 캐시버스터가 붙는다. **배포 직전 반드시** `python3 scripts/stamp-cachebust.py <STAMP>`(예 20260825b) 실행 → 바뀐 css/js 의 ?v= 를 새로 찍고, app-forge-frame 의 iframe forge.html?…&v= 도 같이 올린다. 그 뒤 index.html·forge.html·바뀐 자산을 함께 배포. HTML 은 캐시헤더가 없어(휴리스틱) 곧 재검증되므로 새 버전 쿼리가 곧 반영된다.
- 배포 방법: `lftp -u "parksvc,<메모리 scoopforge-deploy 참조>" sftp://parksvc.mycafe24.com` → put. **호스트는 mycafe24.com — `parksvc.cafe24.com`은 22 포트가 닫혀 있어 무한 대기한다**(2026-08-25 확인). `set net:timeout 15` 걸고 올릴 것.

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
- P5 경제 완료(2026-08-25): wallet-lib 가드형 상수(기본값 불변·전 스위트 유지) + app-api 지갑 브리지(시드 15·상한 15·deep2/custom3·출석 일1+연속7일+5·적중 환급 스위프 멱등 hitref:*) — 출석 6h 주기는 Q13 협의 고정점(현 기준선=일 단위). 클라: MS.wallet(서버 spend/refund 멱등·오프라인 폴백)·MS.xp(게스트 잠금·레벨업 오버레이·저폴리 캐릭터 5종)·XP 훅 전부(방문/메뉴/분석 완주/채점·시그널 확인/작도/종목 추가)·내 스쿱 화면(3개념·레벨/미션·잔고 셀·출석·광고 스텁·설정 동작). 관문 907건+concurrency 6종.
- P6 페르소나 완료(2026-08-25): app-persona-bank.php(서버 은행 — 초기 15문·총량 어떤 응답에도 미포함·append 확장) + persona_q op. app-persona.js(UMD·테스트 7건): heat/단계(경계 [0,4,9,16,31,61]·% 금지)/16스포크 레이더/성향→그룹 매핑(Q14 기준선: 근거·호흡·위험 → t/m/v/q/s, 배율 ±15% 캡)/프리셋 코사인 추천. 홈 카드(하루 첫 답 자동·풀 배급·← 고치기·게스트 3문 잠금·XP+1), pfit 실보정(내역 정직 표기 → 엔진 가중 곱), 프리셋 '내 성향' 활성, 시그널 골드 우선 정렬+문구, 지갑 미션 활성. 답변은 {j,d,l} 스냅샷으로 영속(은행 재조회 불필요) — 서버 병합은 P8. ⚠ 사고 1건: pfit 패치가 openStocks 블록을 삼킴 → HEAD에서 복원(범위 치환 시 끝 마커 주의).
- P7 통계 완료(2026-08-25): 서버 `al_peers_stats`(14일 사용량·7일 종목 점유율·90일 관점별 적중률+'항상 상승' 실측 기준선·나의 적중률/상위%·minN=5 미달 비공개) + peers op(내 대기 채점 스위프 후 집계). stats 화면: 엔진 스와이프 카드 4p(사용량 실값 / walk-forward 정본 58.1% vs 기준선 60.8% — 프로토 62.6%/60.96%/8,214건 샘플은 이식 금지 / validatedAxes 8축 라이브 / 누적 채점·버전 라이브), 최다 분석 종목(HOT·내 관심), 페르소나 분포·가중치 집계·닉네임 리더보드는 P8 전 '집계 준비 중'(무엇이 올지 이름으로). about 시트(app-ui.openAbout — 마니페스토 전문·면책·Contact·엔진 버전/지표 수 라이브, 헤더 ⓘ+통계 푸터). manifesto-engine-v2.png 에셋 편입. 함정 1건: 라우터 host 가 이미 `.ms-screen`(absolute 스크롤러) — 화면 모듈이 host 스타일을 덮지 말 것.
- P8 계정 완료(2026-08-25): 서버 — `auth_start`(논스 발급, wallet-auth.php 브라우저 구간 재사용)·`auth_poll`(w_merge 병합 → 논스 소각 → 게스트 상태 즉시 sync_put·닉네임 생성)·`sync_push/pull`(app-sync-lib: xp/personaIdx max·personaAns 긴 쪽·sigRead 합집합·picks 합집합 상한 12·스칼라 클라 우선)·`withdraw`(동기화 삭제+구글 해제, 원장은 익명 보존)·`app_acct_resolve` 3갈래(최초 링크 기기=자기 계정 / merge_discard 표식 기기 → 구글 계정 / 게스트) — 지갑 ops 전부 해석된 계정을 본다(두 기기 같은 잔액, 재발행 없음). 클라 — app-auth.js(start/poll 2.5s×120·logout·withdraw·변경 디바운스 push 3s·부팅 pull), wallet.state 가 linked/nick 정본 반영, 헤더 아바타=닉 이니셜, 내 스쿱 계정 행/탈퇴(confirm), 홈 페르소나 잠금 CTA·헤더 계정 버튼 → 로그인. dev: `?fixture=1` 스텁 링크(서버 무관, stub 플래그로 서버 override 차단). 라이브 OAuth 는 `forge_google_oauth.json` 업로드 시 자동 활성(없으면 auth-disabled → "준비 중" 토스트). 테스트 app-sync 20건. 함정: 로컬 PHP 는 IP 계정 생성 상한에 걸려 wallet ops 가 500 — 동기화 ops 는 계정을 만들지 않게(resolve create=false) 분리했다.
- P9 마감 완료(2026-08-25): **반응형 §16** — app.css 미디어쿼리 2단(600/840): medium = #msApp 640 캡 · 홈 매트릭스+페르소나 2컬럼(`.ms-home-duo`) · 종목 그리드 3열 · 차트 `.ms-chart-layout` 55/45 2패널(좌 sticky 차트, 우 결과 스크롤, FAB=우패널 하단) · 시트 → 480px 중앙 다이얼로그(inset 0+margin auto — msSheetUp 이 transform 을 쓰므로 transform 센터링 금지); expanded = 탭바 → 좌측 내비 레일(96px 세로) · 차트 62/38 · 그리드 4열 · 본문 1100 캡. 채점·시그널 마스터-디테일은 이월(목록 640 캡으로 대응). **접근성** — 탭바 role=tablist/tab+aria-selected·라벨, 시트 role=dialog aria-modal+포커스+Esc, FAB aria-label. **dev 트리거** — `?fixture=1` 은 로컬·사설망 호스트(localhost/127/10./192.168./100.)에서만 살아 프로덕션 URL 로 켤 수 없다(app-data.devMode 단일 게이트, app-auth 스텁도 이 플래그). 프로토 데모 트리거(fast5·runFail·strk7·watchAd 시뮬)는 애초 이식하지 않았음(03 §7-7 대조 완료). "프로토타입 초기화"→"데이터 초기화", 앱 버전 POLICY.app.version. **리더보드 해금**(P7 이월) — peers 응답에 leads(90일 30회↑ 적중률)·vols(30일 등록) — 구글 연결+닉네임 사용자만, 기기 id 비노출; 레벨 보드는 XP 서버 검증(§15) 전 비공개 유지. **i18n 이월**: 크롬·정책 문자열은 키, 화면 카피는 프로토 원문 인라인(한국어 단일 출시 — 키 분리는 번역 착수 시 일괄, 지침서 §15 "지원 언어·시점 협의"). 3브레이크포인트 스크린샷 대조 완료.
- P10 앱 셸 완료(2026-08-25): `app-shell/`(package.json exact — core/cli/android 8.5.0 · app 8.1.1 · admob 8.1.0, capacitor.config appId `com.moneyscoop.app`, `build-www.mjs` = ../app 복사기(테스트·md 제외)+index 치환: **엔진 `<script>` 를 서버 절대 URL 로 바꾸고 `window.MS_SERVER_BASE` 주입** → `app-data.serverBase()` 가 API·시세 경로 결정, 웹은 종전 `..`). `cap add android` 생성물 커밋(build·local.properties·assets/public 제외), 매니페스트 AdMob 테스트 앱 ID, variables.gradle 광고 SDK 고정(25.4.0/4.0.0). **`gradlew assembleDebug` 성공** — APK 44MB · minSdk 24 · targetSdk 36 · www 28 파일 번들 · forge-core 미번들(0건) 확인. 광고: `app-ads.js`(Capacitor.Plugins.AdMob 직접 — 번들러 없음; ad_config→prepare(ssv.customData=계정 id 원문)→show→보상 리스너→wallet_state 폴링으로 SSV 착지 확인, 클라 지급 없음) + app-api `ad_config/ad_state`(w_ad_units/w_ad_state 재사용, ad_units.json 부재=ads-disabled 킬 스위치, 로컬 확인). 하드웨어 뒤로가기 `bindHardwareBack`(시트→홈→종료). run.sh `app-shell` 스위트(3건). 문서: ANDROID-BUILD.md 하단에 새 셸 절차·광고 활성 순서·릴리스 준비 목록(서명 키·versionCode·R8·FCM 은 Firebase 프로젝트 선행). 실기기 설치는 미실시(USB/usbipd 필요).
- **차트 = forge 임베드 전환(2026-08-25, 브랜치 feat/app-forge-embed)**: 사용자 판정 "작도·축 조작·확대축소가 forge.html 수준이어야, 지금 시뮬레이션 품질은 매우 떨어진다" → 앱 SVG 차트(app-chart.js) 폐기, **forge.html?embed=app 을 iframe 으로 실행**(설계 `docs/superpowers/specs/2026-08-25-app-forge-embed.md`). forge 측 추가·게이트만: `EMBED` 플래그(forge-state — 저장 3종 차단·boot 분기·ready), `_embedEmit` 훅(forge-app — step/done/stopped/result), `html.embed` CSS(hero 만), `forge-embed.js`(postMessage API: load{symbol,tf,tier,weights,confirmed,evidenceOff}/play/stop/tf/evidence/fit/theme/lock — 기본=IND_TIERS[0] 5종만 보드에, 가중=_driftW, 예측선 p1/p3 규약, confirmed=_deepSessionDocs). 앱 측 `app-forge-frame.js`(단일 iframe·#msApp 오버레이 배치 — **재부모화=재로드라 옮기지 않는다**·Promise API), 분석 화면(자리표시자+syncFrame·작도 토글→evidence off·핀치는 프레임), 실행 화면(load→play, 시트 서사=frame step, pump 가 frameDone 대기). `app-engine.finalWeights`/`weightsApplied` 로 앱 분석과 프레임이 같은 W. 판정 바 '시장 평균 60.96%' 샘플 유출 → 기준선 60.8% 로 교정. 라이브 E2E: 프레임 ready→basic result(5종)→play done→chart 확정 콘, PC 일반 모드 무회귀, 관문 952. **이월**: 판정 정합 로그(앱 엔진 vs 프레임 verdict), 작도 토글 시트 E2E, 커스텀 mix 를 프레임 레일로 대체할지, 접힌 범례 칩.
- **봉 전송 정책 확정(2026-08-25)**: 실측 — 엔진 판정·목표가는 **이력 길이에 따라 달라진다**(NVDA 일봉 deep: 400봉 64%/229 · 1000봉 68%/233 · 전량 63%/223; 방향은 안정). 따라서 **분석용 요청은 PC 와 같은 전량 이력**(limit 금지 — 앱·프레임·PC 정합), 이력 창 축소는 엔진 정책(백테스트 관문) 사안으로 §15 협의. 효율은 전송에서: 서버 `Cache-Control: private, max-age 300/1800`(앱 페이지·포지 프레임 같은 오리진 → 한 번 받으면 공유) + gzip(419KB→102KB) + `since=` 델타 재갱신(수백 B) + 응답 소수 4자리/거래량 정수 + **홈 시세·시그널·종목 시트는 `limit=60` 경량**(표시·감지용). app-data 스토어: 경량/전량 캐시 구분·경량→전량 승격·델타 머지(`mergeCandles`), 테스트 2건. `POLICY.data`(liteBars 60·fresh) 리모트 컨피그 대상. PC fetch 도 `cache:"default"`(HTTP 캐시 공유).
- **[이후 과제 · 엔진 철학] 분석의 비결정성(사용자 요건 2026-08-25)**: 사용자 지시 — "분석 결과와 해석은 매번 동일할 수 없다. 스쿱엔진은 단순한 공식이 아니다. 동일 조건으로 한 번 분석했다고 최근 결과를 재현/캐시해 보여주면 안 된다(사람이 작도하듯 매번 해석이 달라져도 된다)." **현 상태(실측)**: 엔진 `run()` 은 완전 결정론적 순수 함수 — 같은 종목·봉 → 3회 완전 동일(dir/prob/target/agree/pathSum 일치). `Math.random`·`Date.now` 없음, 콘 흔들림도 입력 해시 시드 PRNG(재현). 앱도 24h 결과 캐시(`MS.reports`)+동일 파라미터 재계산(`maybeRebuild`). **왜 결정론인가**: 채점 원장이 예측 안정성을 전제(등록→다음 봉 채점, 그날 마지막 1건). **이후 과제 범위**(§② 엔진 프로토콜·§15 협의): ① 비결정성을 어디에 넣나(지표 파라미터 지터·앙상블 샘플링·시점 노이즈 등 — 이론 정합 유지) ② 채점 대상 정의(어느 실행을 채점? 재분석이 다른 점수를 내도 되나?) ③ 정직 표기(같은 근거인데 판정이 다른 이유를 사용자에게 설명) ④ 백테스트 관문(비결정 도입 후 성적 회귀 없어야). 협상 불가 3원칙(정직 표기·법적 고지·엔진 단일 원본)은 유지. **엔진 패치 전까지는 현 결정론 유지** — draft 로드로 '결과 미리보임'만 제거했고, 재현성 자체는 그대로다.
- **전 페이즈 종료.** 다음은 외부 자원이 열리는 순서대로: ① `forge_google_oauth.json` 업로드 → 실 로그인 라이브 검증 ② AdMob 콘솔 유닛+SSV URL 등록 → `ad_units.json` 업로드 → APK 실기기 광고 E2E ③ 서명 키·versionCode → `assembleRelease` ④ Firebase → FCM+시그널 서버 스캔. 코드 이월(§5): 채점/시그널 마스터-디테일 · i18n 키 분리 · XP 서버 검증(레벨 보드) · 페르소나 분포/가중치 집계 · 작도 PC 동조 개선.

### 2026-08-25 (3세션) — 손맛 폴리시 · 커스텀 성능 · 레벨 리더보드
- **손맛/시각 폴리시 다수(라이브)**: 리워드 버스트(bd5f567·e24a0f8) → 탭 촉각 피드백+게스트 안내 토스트(06fb49d) → 화면 전환 페이드(343f125) → 관심종목 0 홈유지·종목추가 시트(a1f7abc) → 분석현황 빈 상태 첫분석 안내(46ea3cd) → **당겨서 새로고침**(8a174da, home·signal·score·stats·wallet PTR, refreshCurrent 라우터 신설, 차트/플로우 제외).
- **커스텀 가중치 패널 성능(1490d4a)**: 사용자 제보 "진입이 안 될 정도로 느림". 실측 — 전량 이력(5027봉) 커스텀 analyze 17.6초. 범인 `analyzeCycle`(pmax:0=2010봉 스캔) O(n²) 단독 2187ms(그 외 31지표 ≤12ms). 미리보기를 최근 400봉 창으로 → 0.43초(40배). 채점 실행은 전량 유지. ★근본해결=엔진 pmax 캡(채점 출력 변경→백테스트 관문, docs/BACKLOG.md 상단·레인A). 전 32지표 점검 완료(다른 폭탄 없음).
- **레벨 리더보드(397eb54) — 브레인스토밍→구현**: XP 서버 검증 이월을 해결. **접근=원장 파생 활동 XP**(클라 참여 XP 아님). al_level_xp(등록×3+적중×2)·al_activity_level(삼각수 확장)·al_level_ranks. peers op에 levels(상위4·구글연결·등록 10건 문턱)+myLevel. 통계 화면 레벨 보드 해금(cyan→violet·Lv배지·나의 활동레벨·정직 고지). **§15 'XP 서버 검증 전 비공개' 조건 충족 → 해금**. 새 테이블·XP이벤트API·안티게이밍 불필요. 관문 964건(app-ledger 40). ★SQLite HAVING 바인딩 파라미터=0행 함정(int 인라인 회피).
- **비공개 유지 확인**: /map/app/ 개발용 URL — noindex(앱·forge·랜딩)+robots.txt Disallow:/ 완비. 접근 제어는 미적용(원격 테스트·헤드리스 유지 — 사용자 확정).
- **종목 변경 횟수 제한 제거(877b473)**: stockOpsPerDay(6) 하드 캡은 XP 파밍 방지용이었으나 XP는 이미 별도 캡(stockAdd 3/일)+레벨 보드가 원장 기반이라 파밍 무의미 → 변경 자체 차단 제거(사용자 지시). XP 캡만 유지, 변경은 무제한(stocksMax 12 내). dead stockOps 정리.
- **통계 실집계 2종 완료(c6dc070·e75743b)**: 접근=클라 파생값 sync 송신+서버 집계(DIM_GROUP PHP 복제 회피, 드리프트 0). **페르소나 분포**(personaGroups→우세 그룹 argmax 분포·답 3문 미만 컷) + **가중치 인기**(weights→지표별 평균 배율 다이버징 바·커스텀만) — 둘 다 minN 5·구글연결·개별 노출 0. sync_persona_dist·sync_weights_pop, peers op personaDist/weightPop, 통계 piesCard/wtsCard 실렌더. 관문 970건(app-sync 26). **통계 화면 '집계 준비 중'은 이제 리더보드(실 자격 데이터 대기)만 남음.**
- **데스크톱 미대응 확인(사용자 질의)**: 폰 우선 하이브리드라 PC 브라우저는 제품 타깃 아님(/map/app=dev URL). '느림'=cycle O(n²)(어디서나·엔진 레인A), '레이아웃 이상'=태블릿 티어가 데스크톱 폭 스트레치(#msApp max-width 캡 없음). 사용자 판단: 데스크톱 센터링 보류, 앱 개발 계속.
- **이월 갱신**: XP 서버 검증(레벨 보드)·통계 실집계(페르소나·가중치) ✅ 완료. 남은 코드 이월: 채점/시그널 마스터-디테일(태블릿) · i18n 키. 외부 자원 대기: OAuth·AdMob·FCM·서명. 엔진(레인A): cycle pmax 캡 · 추세선 작도.

### 2026-08-25 (2세션) — 차트 카메라 · 리워드 손맛 · 동시개발 지침
- **임베드 시연 카메라 = 지표별 실작도 구간(6672bb7 계열, forge-embed v=20260825p)**: 사용자 "그냥 확대·축소 반복, 인위적" → `_regionForNode`(엔진 결과에서 도형 좌표: 피보 스윙+레벨·추세 지배창·엘리어트 파동·구조 스윙·룩백형 창), `_frameFromRegion`(X·Y 동시 프레이밍·상한 340봉), `_frameDiffers`(가까우면 카메라 고정 — 미세줌 흔들림 제거·오실레이터 hold). 실측 딥 이동 9회·줌 57~340봉. **채점 판정·콘 불변**(작도 연출 도메인). ★차트 파이프라인 라이브 정합: app-forge-frame(v=p)→forge.html(v=p)→forge-embed(DIAG p)·region 함수 6개.
- **볼드 리워드 버스트(bd5f567·e24a0f8)**: 스쿱·경험치 획득 손맛 강화(사용자 "보상 느낌 부족"). `MS.ui.reward(kind,amount,{label})` — 중앙 펀치업 +N·아이콘(스쿱◈골드/경험치✦그린)·스파크 8개 확산·링·사유 라벨. 진동 강화(POLICY.ui.haptics earn/reward/rewardBig, 크기 비례). 지급 전 지점 연결(방문·페르소나·시그널·채점·출석·연속·적중환급·광고). **가독성 수정**: 카드 반투명→불투명 `--sf1`·사유 `--m2`→`--t2`(테마 대응 고대비 — 사용자 "폰트 어두워 안 보임").
- **탭 촉각 피드백 + 게스트 안내 정리(06fb49d)**: init 전역 capture click → 탭바·버튼·CTA tick[12] 진동(일상 조작 무음이던 것). 게스트 XP 중앙 팝(콘텐츠 가림)→하단 토스트 "로그인하면 경험치가 쌓여요"(‘+N’ 오해 표기 제거·xpPop dead code 삭제).
- **PC 추세선 정비 백로그 등록(339cfea, docs/BACKLOG.md)**: 앱 시연서 의미없는/부정확한 추세선 발견 → PC 엔진 트랙으로 이관(작도 vs 엔진 분해·§② 관문). 모바일은 forge 임베드라 PC 수정+배포 시 자동 상속.
- **동시 개발 프로토콜 §⑦ 지침화(37d49ca, map/CLAUDE.md)**: 세 트랙(엔진·웹PC·모바일) 결합 비대칭 → 현행 2레인(A 엔진+웹, B 모바일)·공유 이음새 2곳(forge-embed·지표 레지스트리)·배포 직렬화. 3트랙은 이후 개선.
- 관문 954건 유지. **다음(사용자 선택)**: 서비스 손맛·시각 폴리시 계속.

### 2026-08-26 — 실 출시 준비 배선·검증 (외부 자원 4기능 활성화 감사)
- **활성화 러너북 신설 `docs/design-v2/LAUNCH.md`**: 구글 로그인·AdMob·FCM·서명 4기능을 켜는 순서·파일 포맷·검증법의 단일 체크리스트. AdMob 활성 순서·릴리스 서명은 ANDROID-BUILD.md(§광고 켜는 순서·§릴리스 트랙)를 인용, **문서에 없던 OAuth 활성 러너북(콘솔 웹 클라이언트·리디렉션 URI `.../map/wallet-auth.php`·`forge_google_oauth.json` 웹루트 업로드·auth_start 검증)**을 채웠다.
- **라이브 게이트 실측(2026-08-26)**: `auth_start`→`auth-disabled` ✓·`ad_config`→`ads-disabled` ✓·`wallet-auth.php`→400 ✓ (전부 정상 활성화-대기 — 배선 살아있고 config 파일만 대기). `w_oauth_conf()` 게이트 스텁 검증(config 없음=NULL·스텁=활성·빈 client_id=무효).
- **★배포 공백 수습 — `wallet-ssv.php` 라이브 404**: 2026-08-15 커밋됐으나 cafe24 에 배포된 적 없었다(CLAUDE.md §④ 가 경고한 지뢰 — AdMob 활성 시 구글 SSV 콜백 404 → 아무도 보상 못 받음). ads-disabled 상태라 무해했으나 **AdMob 활성화의 0번 선행조건**. 해소: `./tests/run.sh concurrency` 6종 통과 → 지갑 세트(wallet-ssv·wallet-lib·wallet-api) 동반 배포 → `wallet-ssv.php` HTTP 200 확인.
- **배선 상태 확정**: ① OAuth = 서버·클라 완결, 웹 turnkey(셸 불필요) ② AdMob = 서버·클라·셸 완결(SSV 수습 후 콘솔+ad_units.json 만) ③ FCM = **전무**(app-shell 플러그인에도 없음 — Firebase 프로젝트부터 짓는 과제, 시그널 서버 스캔 승격과 한 세트) ④ 서명 = release 빌드타입만·서명/R8 없음(스토어 제출 직전). 엔진↔서버 동조 불변(셸은 엔진을 서버 절대 URL 참조 — APK 빌드 전 www/map 현행 확인).
- **다음(외부 자원 열리는 순서)**: ① `forge_google_oauth.json` 업로드 → 실 로그인 라이브 검증(오늘 가능) ② AdMob 콘솔 유닛+SSV URL → `ad_units.json` ③ 서명 키 → assembleRelease ④ Firebase → FCM. 코드 이월은 §5 상단 목록 유지.
- **FCM 푸시 설계 완료(2026-08-26, 승인·미착수)**: 사용자가 4기능 중 FCM을 "구축 트랙"으로 선택 → brainstorming 완료. **설계서 `docs/superpowers/specs/2026-08-26-app-push-signals-design.md`(커밋 238442e)**. 확정: 일일 다이제스트·엔진 확신도 게이트(`rankSignal` 공유 순수함수: 시그널 dir × `aggUpProb` strength≥0.30·하루 3건 캡)·07시 KST 발송·디바이스 등록부. 외부 node 스캐너(실 app-signals·forge-core)·서버는 등록부·발송로그만(감지 결정적→앱 재현). **Phase 1**(Firebase 무관·지금 구축 가능): rankSignal+인앱 '밤사이 중요' 하이라이트+`scan/scan-core.mjs`+`app-push-lib.php`(push_register/scan_registry/push_send)+테스트. **Phase 2**(Firebase 게이트): `@capacitor` 푸시 플러그인+FCM HTTP v1 발송+`app_fcm.json` 킬스위치+APK 재빌드. **재개 지점 = 설계서 사용자 리뷰 → writing-plans(Phase 1)**. 미결: 스캐너 cron 호스트(코드 무관).
- **도메인 전환 계획 확정(2026-08-26)**: 출시 얼굴 = `moneyscoop.co.kr/app`(개발은 parksvc.mycafe24.com/map 유지). cafe24 멀티도메인 연결폴더=`map`로 루트 매핑 → 파일 이동·데이터 이사 없음, 웹 무변경(상대경로), APK 상수 2곳(`build-www.mjs` SERVER_BASE·`app-forge-frame.js` PROD_BASE) `/map` 제거+재빌드, OAuth/SSV URI만 moneyscoop 호스트. 상세 `LAUNCH.md §4-B`.

### 2026-08-27 — FCM 푸시 Phase 1(Firebase 무관 전량 구축)
- **확신도 게이트 `rankSignal`(app-signals, 공유 순수함수)**: `strength=|prob−50|/50`, 정렬(방향 시그널=국면/확률 방향 일치, 무방향 룰=강한 방향관) ∧ `strength ≥ POLICY.signal.conv(0.30)`. **앱과 스캐너가 같은 함수를 호출**한다(사본 0). `POLICY.signal` 신설(conv·pushCap 3·pushHourKST 7·**verdictTier basic**).
- **판정 계약 확정**: 시그널 확신도 = `app-engine.analyze({tier:"basic", tfKo:"일", 전량 이력})`. 티어·봉 길이를 못박은 이유 = 판정이 이력 길이에 의존(2026-08-25 실측), 앱은 관심종목 전량을 백그라운드로 돌 수 있어야 한다. **설계서가 열어둔 '판정 정합 이식'은 불필요**했다 — `app-engine.js` 가 이미 node-require 가능해 스캐너가 같은 함수를 부른다.
- **비용 실측(프로덕션 GET, 읽기 전용)**: NVDA 5,030봉 fetch 188ms + **basic 판정 82ms**(TSLA 4,066봉 39ms). 인앱 랭킹 비용 위험 해소 — 감지 0건 종목은 엔진을 아예 부르지 않는다.
- **스캐너 `map/scan/`**: `scan-core.mjs`(순수 — 종목 합집합·선별·캡·다이제스트, 10건) + `scanner.mjs`(배선 — registry→OHLC 전량→detect→analyze→push_send, `--dry-run`) + README(cron 22:00 UTC = 07:00 KST). 엔진·감지는 `../app/*` 원본 require. **cafe24 배포 대상 아님**.
- **서버 `app-push-lib.php`**: `<data>/app_push.db`(devices·sends) · `push_register`(앱) · `scan_registry`/`push_send`(`X-Scan-Key` — device 검증 앞에서 인증, 키 파일 부재=403 fail-closed) · **하루 1회 캡은 `unique(device, day)`가 강제**(스캐너 재실행 멱등) · FCM HTTP v1 발송기(JWT→OAuth2→messages:send)는 `app_fcm.json` 있을 때만 생성(킬스위치 — Phase 1 은 `queued`만). 테스트 14건.
- **인앱 하이라이트**: `app-push.js`(등록 송신 디바운스 3s + 종목 판정 캐시 `sym|barT` + 순차 랭킹·부분 결과 스트리밍) → 시그널 화면 '엔진 확신' 배지 · **정렬 3단(확신 → 페르소나 → 최신 봉)** · 펼침에 실측 상승 확률 표기. `sigRank`/`sigImpN` 은 휘발(persistKeys 아님). 헤드리스 검증 390×844 pageerror 0. 부수: `bind()` 스크롤 핸들러에 복제돼 있던 정렬 블록 제거(길이만 필요).
- 관문 **1003건**(app 96 · scan 10 · app-push 14 신규). 라이브 배포(앱 + 서버 세트).
- **남은 것(Phase 2 · Firebase 게이트)**: 푸시 플러그인·토큰 포착·딥링크·APK 재빌드·`app_fcm.json`·`app_scan_key.txt`·스캐너 cron 호스트(운영 결정 — 코드 무관). 절차는 [`LAUNCH.md`](LAUNCH.md) §3.

### 2026-08-28 — 채점·시그널 마스터-디테일(§16 이월 해소)
- **정본 확인 먼저**: 지침서 §16 은 medium(600~839)에서 두 화면을 **단일 목록 유지(본문 640 캡)** 로 못박고, 마스터-디테일은 **expanded(840+) 전용**("좌 목록 | 우 상세 — 펼침 대신 우측 고정 표시")이다. 반응형 데모는 medium 720px 의 홈·분석만 증명하므로 이 배치의 픽셀 시안은 없다 — 규칙 + 앱 내 선례(차트 2패널)로 지었다.
- **공통 헬퍼** `MS.ui.isExpanded()` · `onExpandedChange(cb)`(matchMedia 840 — app.css 미디어쿼리와 한 쌍, 두 화면이 같은 판정을 쓴다). 전환 시 화면·선택 유지한 채 재렌더(§16 전환 연속성 — 1200→390 리사이즈 실측).
- **레이아웃** `.ms-md` 40/60(목록=한 줄 요약, 상세=산문) · 우 패널 `position:sticky` 독립 스크롤 · `.ms-md-inner` 480 캡(§16 불변 "카드 최대 폭 480 — 늘리지 말고 컬럼을 늘린다") · 그리드 아이템 `min-width:0`(말줄임 보호).
- **상세 본문은 한 벌**: `detailHtml()` 분리 → compact/medium 인라인 펼침과 expanded 우측 패널이 같은 마크업을 쓴다(두 벌 두면 어긋난다). 채점은 헤더(종목·주기·프리셋·결과·등록시각) + 본문, 시그널은 헤더(종목·제목·봉 날짜) + 본문.
- **상호작용**: expanded 는 '선택'이 활성 상태 — 셰브런 숨김, 선택 행은 배경·보더로 강조(좌측 컬러 라인 금지), 선택이 비면 첫 행 자동 고정 표시. **자동 선택은 읽음·XP 로 치지 않는다**(시그널 읽음·채점 확인 XP 는 사용자 클릭에서만 — 화면 진입만으로 XP 가 붙는 것을 막았다).
- 검증: 헤드리스 1200/720/390 pageerror 0, 로컬 원장에 결정적 더미 3건 적재해 우측 패널 실렌더·행 전환 확인, medium·compact 인라인 펼침 무회귀. 관문 1003건.
- **이월 갱신**: 채점/시그널 마스터-디테일 ✅ 완료. 남은 코드 이월 = i18n 키 분리(번역 착수 시) · 작도 PC 동조(레인 A). 외부 자원 = OAuth·AdMob·FCM Phase 2·서명.

### 2026-08-28 (2) — 추세선 작도 정비(레인 A · 앱은 자동 상속)
- 앱 시연에서 제보된 "의미없는 추세선 + 각도 부정확"을 진단 → **적합 구간 ≠ 표시 구간** 단일 원인(장기창=전 이력 5,030봉, 화면=84~180봉). 실측: NVDA 장기선이 플롯 밴드 밖 −2.1배·현재가 대비 −59%인데 R²log 0.86이라 기존 weak 게이트가 못 걸렀다. `forge-core.trendScreenFit`(표시 구간 적합도 — **run() 미호출·판정 불변**) + 플롯 클립 + 화면 밖이면 선 대신 값 배지. **엔진 창 정의 변경은 채점 드리프트를 움직이므로 §② 백테스트 관문과 함께 별건**(BACKLOG 기록).
- 앱은 `forge.html?embed=app` 을 그대로 실행하므로 **모바일 코드 수정 0** — forge 세트 배포로 자동 상속.
- ★**배포 도구 조용한 실패 수습**: `stamp-cachebust.py` 가 `app-forge-frame.js` 의 iframe 버전을 **0건 매치로 못 찍고 있었다**(URL 이 JS 문자열 연결로 끊겨 따옴표를 못 넘음). "no change (패턴 확인)"만 찍고 성공처럼 끝나, forge 자산은 새 스탬프를 받는데 **앱 iframe 만 옛 버전에 고정**되는 상태였다 — 앱 사용자가 새 차트 코드를 못 받는 경로. 버전 리터럴 직접 치환으로 교체(20260828c).
- 관문 1009건. 라이브 확인(배지 렌더·pageerror 0).

---

### 2026-08-29 — 홈 레벨 카드(시안 dash §4 누락 보완) · 정합 수정 3건

- **홈 레벨 카드 추가** — 시안 홈 4번째 블록(프로토 L1425–1498)이 P2 홈 태스크에서 빠져 있었다(이월 기록 없음 = 누락). 주간 분석·연속 방문 다음, 내 관심 종목 앞. 궤도 SVG + 캐릭터(연결)/??? 잠김+구글 CTA(게스트) + 레벨·다음 레벨까지 + 페르소나 게이지(단계명, 누르면 페르소나 카드로 스크롤) + **경험치 TIP 무한 마퀴**(칩 → 시그널/채점/분석 티어 시트/페르소나/작도/내 스쿱/종목 추가) + 오늘 경험치. 값은 내 스쿱과 같은 출처(`MS.xp.gaugeOf`·`levelName`(신설)·`charSvg`, `MS.persona.stageOf`). 스크린샷 2상태 대조·클릭 동선 헤드리스 확인.
- 정합: '다음 단계에서 열려요' 막다른 길 4곳 연결(d5716c1) · 페르소나 '오늘 N답'을 답 시각에서 파생(c859f90) · 구글 콜백 즉시 병합(e9f25f6).

### 2026-08-29 (2) — 레벨업 체감(B 보상 시퀀스 · A 캐릭터 진화 · C 임박) — `feat/levelup-fx`

- **B 보상 시퀀스**: 레벨업 오버레이를 3장면으로 — 선물 상자(탭해야 열림) → 진화(구 캐릭터 발광·파편 → 새 캐릭터 성장, 카드 색이 새 레벨 색으로) → 보상 공개(◈ 풀충전 카운트업 `9→17` · 지갑 상한 막대 `15→17` · 좋아요). `levelUpFill` 이 결과를 돌려주고 연출이 그 값을 쓴다(오프라인이면 "다음 접속 때 맞춰져요"). 레벨업 전용 햅틱.
- **A 캐릭터 5종**: 실루엣·색·상시 모션이 레벨마다 다름(원석 정지 / 결정 둥실 / 다면체+궤도 링 / 왕관+위성 공전 / 오라 회전+빛줄기). SMIL 이라 홈·내 스쿱·오버레이 어디서든 같은 움직임.
- **C 임박**: `MS.config.levelGauge`(단일 계산, remain·near 85%↑) — 헤더 게이지 펄스, 홈 카드 캐릭터 발광 + "N 남음 — 시그널 1건 열람이면 레벨업" 행동 제안, 레벨업 후 24h NEW 리본(`lvUpAt` 영속) + 내 스쿱 "Lv.N 달성 MM.DD".
- **D(레벨별 혜택 차등)은 정책 협의 대기** — BACKLOG 참조.

### 2026-08-30 — 예측 콘 복구(임베드 _drawWide) · 작도 토글 칩 줄

- **버그**: 결과 화면에 작도만 보이고 예측 영역이 없었다. 원인 = 시연이 켠 `_drawWide`(전폭 캔들만) 를 결과 로드(`onLoad` 비-draft)가 안 끔 → 같은 iframe 에서 forge-draw 가 `pred=null`. 해제 코드가 소스 어디에도 없었다("onPlayEnd 가 해제" 주석은 거짓). 결과 로드에서 해제 + 로그축 재판정. 라이브 실측 전/후: `wide:true·log:true` → `wide:false·log:false·창 84봉(콘 맞춤)`.
- **UX**: 지표별 작도 보기·숨기기 시트(차트를 가림) → 차트 바로 아래 가로 스크롤 **칩 줄**(전체 켜기/끄기 + 지표 칩, 탭 즉시 반영·XP 유지). `openDraws` 제거.

## 갱신 규칙 (Claude 작업 규율)

- **페이즈 완료·배포·사용자 확정이 있을 때마다** §0 표·§3·§5 로그를 갱신하고 같은 커밋에 포함한다.
- 세션이 길어지면 중간에도 §5에 "진행 중 지점"을 남긴다(다음 파일·다음 태스크 명시).
- 이 문서는 요약이다 — 상세는 BUILD-PLAN·플랜 문서·CLAUDE.md 가 정본이며 어긋나면 그쪽을 고친다.
