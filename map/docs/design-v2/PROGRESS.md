# 머니스쿱 앱 — 진행 로그 · 재개 지점

**세션이 끊기면 이 문서 하나로 이어진다.** 페이즈 완료·배포·중요 결정 때마다 갱신한다(갱신 규칙은 맨 아래).
최종 갱신: **2026-08-25 (P10 앱 셸 완료 — 전 페이즈 종료)**

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
| **다음** | — | 외부 자원 대기: 실 OAuth 파일 · AdMob 실유닛(ad_units.json) · Firebase(FCM) · 릴리스 서명 키. 코드 트랙은 이월 목록(§5 P7~P9)과 지속 개선(작도 PC 동조) |

**라이브**: https://parksvc.mycafe24.com/map/app/ (실데이터 — cafe24에서만 시세 프록시 동작. 로컬은 `?fixture=1`)

## 1. 새 세션 재개 절차

1. 이 문서 → [`BUILD-PLAN.md`](BUILD-PLAN.md)(아키텍처·모듈 맵·엔진 브리지 계약·Q1~12) → `map/CLAUDE.md` §앱 트랙(규칙 요약) 순으로 읽는다.
2. `cd map && ./tests/run.sh` — **947건 전체 초록이 기준선**(app 73 · app-ledger 21 · app-wallet-bridge 13 포함). wallet-lib 을 만졌으면 `./tests/run.sh concurrency` 도.
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
- **서버 동반 세트**: `www/map/app-api.php` + `app-ledger-lib.php` + `app-wallet-bridge.php` + `app-persona-bank.php`(P6) + `app-sync-lib.php`(P8) + `wallet-lib.php`(가드형 상수 — 같이 올리고 같이 검증, wallet-lib 수정 시 concurrency 관문 필수).
- **엔진**: 앱은 서버의 `www/map/forge-core.js` 를 상대참조 — **엔진 커밋 미배포 시 앱이 죽는다**(aggUpProb 사고, CLAUDE.md 기록). 엔진 올릴 땐 forge 동반 세트 확인.
- **불가침**: `<data>/app_ledger.db`(예측·채점 원장) + 기존 forge_*·wallet 목록.
- **앱 셸(APK)**: `map/app-shell/` — 스토어 릴리스 트랙(커밋+푸시 한 세트, 배포 별도). 절차·릴리스 준비 목록은 `docs/ANDROID-BUILD.md` 하단 절. 디버그 APK 44MB(인트로 mp4 3종 포함 — 릴리스 전 R8·에셋 다이어트 과제).
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
- **전 페이즈 종료.** 다음은 외부 자원이 열리는 순서대로: ① `forge_google_oauth.json` 업로드 → 실 로그인 라이브 검증 ② AdMob 콘솔 유닛+SSV URL 등록 → `ad_units.json` 업로드 → APK 실기기 광고 E2E ③ 서명 키·versionCode → `assembleRelease` ④ Firebase → FCM+시그널 서버 스캔. 코드 이월(§5): 채점/시그널 마스터-디테일 · i18n 키 분리 · XP 서버 검증(레벨 보드) · 페르소나 분포/가중치 집계 · 작도 PC 동조 개선.

---

## 갱신 규칙 (Claude 작업 규율)

- **페이즈 완료·배포·사용자 확정이 있을 때마다** §0 표·§3·§5 로그를 갱신하고 같은 커밋에 포함한다.
- 세션이 길어지면 중간에도 §5에 "진행 중 지점"을 남긴다(다음 파일·다음 태스크 명시).
- 이 문서는 요약이다 — 상세는 BUILD-PLAN·플랜 문서·CLAUDE.md 가 정본이며 어긋나면 그쪽을 고친다.
