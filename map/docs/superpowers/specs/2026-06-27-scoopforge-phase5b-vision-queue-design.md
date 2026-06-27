# 스쿱포지 Phase 5-B (R5b) — 비전 분석 작업큐 (MVP) 설계

- 날짜: 2026-06-27
- 선행: Phase 5-A(R5a) "포지 분석" 재생 배포 완료(`runSteps` 누적 + 단계 애니메이션).
- 상태: 컨셉·아키텍처 합의 완료 → 구현 설계.
- 범위: **R5b MVP(작업큐 + Claude 워커 + 폴링 반영 + C 하이브리드 결합)**. 이미지 위 정밀 보조선은 **R5b-2로 분리**.

## 0. 상위 맥락

R5 = R5a(재생 연출, 완료) + R5b(비전 실속). R5b는 R5a의 **데모 데이터를 진짜 분석으로 교체**한다.

비전 흐름: **`☁ 분석 요청` 버튼 → forge-api.php 작업큐(enqueue) → Claude 워커(`/forge-analyze`, 세션 온디맨드 + 추후 예약 루틴)가 대표 이미지+전략 보드를 읽어 분석 → 결과 POST(result) → 페이지 폴링(jobs)으로 반영(추출 series + 바이어스 보정)** → R5a `runSteps` 재생/`fcDrawFuture`가 진짜 데이터로 동작.

### 확정된 결정 (브레인스토밍)

1. **Claude 호출 방식 = A**: Claude Code 세션/예약 루틴이 큐를 폴링. **Claude API 미사용 — cafe24에 API 키 두지 않음.** forge-api.php는 순수 JSON 저장소(잡/결과 보관)일 뿐 Anthropic을 호출하지 않는다. (B안 = PHP가 Claude API 직접 호출 → **영구 비범위**.)
2. **범위 = A(MVP 먼저)**: 큐+폴링+워커+결과 스키마(1~4). 이미지 위 정밀 보조선(5)은 R5b-2.
3. **엔진 결합 = C(하이브리드)**: Claude가 ① series 추출(엔진 입력) + ② 고수준 주석(바이어스/파동/확신)을 반환. series는 보드 엔진이 계산, bias는 conviction형 보정으로 예측에 결합. R5a 엔진(`run`/`runSteps`) 그대로 재사용.
4. **워커 형태 = A(슬래시 커맨드)**: `.claude/commands/forge-analyze.md` 런북. 온디맨드 + 추후 `/schedule` 재사용. (예약 루틴 등록은 동작 확인 후.)
5. **보드 스냅샷 포함**: 잡에 요청 시점 전략(nodes/edges)을 저장 → 사용자가 편집해도 분석 재현.
6. **series = 종가 배열만**(OHLC/거래량 비범위).

## 1. 아키텍처

```
[forge.html]                  [forge-api.php]               [Claude 워커 /forge-analyze]
  ☁ 분석 요청  ──enqueue──▶   jobs[] 에 pending 적재
       │                                                ◀──claim── pending 1건 원자적 점유(working)+token
       │ poll(jobs, 2.5s)                                     │ 이미지 dataURL(?images=1) + board Read(비전)
       │                                                      │ C 스키마 결과 생산
       ▼                          result(token) ◀────────  POST(done) / error
  applyVision: data=series 주입 + visionBias 보정
  → run/runSteps 재계산 → fcDrawFuture + ▷ 포지 분석 재생
```

- 큐는 forge-api.php에 op 4종 추가 + 별도 파일 `forge_jobs.json`. 이미지·보드 본문은 잡에 미포함(imgId/docId 참조 + board 스냅샷만) → POST <128KB 유지.
- 워커 = Claude 세션이 `/forge-analyze` 실행(결정적 코드 아님, 판단). 이미지는 Claude Code 내장 비전(`Read`)으로 판독, 결과는 `curl`/POST.

## 2. 데이터 모델

### Job (`forge_jobs.json` = `{ jobs:[...], _rev:N }`)

```js
job = {
  id,                    // 서버 생성 uid("job")
  docId, imgId,          // 참조만(이미지/문서 본문 X)
  board: { nodes, edges },  // 요청 시점 전략 스냅샷(편집돼도 재현)
  status: "pending"|"working"|"done"|"error",
  token,                 // claim 토큰(원자적 점유·늦은 덮어쓰기 차단)
  created, claimed, finished,  // ISO 문자열(서버 생성)
  result: <Result>|null,
  error: string|null
}
```

### Result (C 하이브리드 스키마)

```js
result = {
  series: [Number...],   // ① 대표 이미지에서 추출한 종가 시계열 → data.price (200~400 다운샘플)
  bias: { dir:"bull"|"bear"|"neutral", strength: 0..1 },  // ② 전체 방향 → visionBias
  waves: [{ from, to, label }],  // ② 파동 구간(series 인덱스) — MVP는 표시 전용(엔진 미결합)
  note: String,          // 1~2문장 판독 근거(한국어)
  coords: null           // ③ 보조선 픽셀 좌표 — R5b-2 예약(MVP는 null)
}
```

- `series`가 비면 데모(`makeDemoSeries`)로 graceful 폴백.
- `coords` 자리를 미리 열어 R5b-2(이미지 위 보조선)와 스키마 호환.

## 3. 큐 API (forge-api.php 확장)

기존 doc CRUD는 불변. 큐는 별도 파일 + 새 op 4종. 모두 `flock(LOCK_EX)` + 임시파일 rename(기존 패턴), 본문 <128KB.

| op | 페이로드 | 동작 | 응답 |
|---|---|---|---|
| `enqueue` | `{docId, imgId, board}` | `pending` 잡 생성(서버가 id/created/status 채움). **중복 가드**: 같은 docId의 미완료(pending/working) 잡 있으면 그걸 반환(재적재 X). **GC**: done/error 잡 20개 초과 시 오래된 것부터 정리 | `{ok, job}` |
| `claim` | `{}` | 가장 오래된 `pending` 1건 → 원자적 `working` 전환 + `token` 발급 + `claimed` 기록. 없으면 `job:null` | `{ok, job, token}` |
| `result` | `{jobId, token, result}` 또는 `{jobId, token, error}` | `token` 일치 시에만 `done`(result)/`error`(error) + `finished` 기록. 불일치/없음 → 409 | `{ok}` |
| `jobs` | `{docId?}` (GET/POST) | 잡 목록(docId 필터 가능). 클라이언트 폴링·워커 조회 공용. result 본문 포함 | `{ok, jobs}` |

- 인증: 기존 `check_key` 그대로. 쓰기 op(enqueue/claim/result)는 키 설정 시 검증, `jobs` GET은 공개.
- 원자적 claim: lock 안에서 pending 첫 건 → working + token 후 기록(두 워커 동시 claim 시 한쪽만 성공).
- 토큰: claim 발급 token을 result가 반드시 제시 → 점유 충돌·지연 워커의 늦은 덮어쓰기 차단.

## 4. 클라이언트 (forge.html)

### 분석 요청 버튼

- 헤더 `▷ 포지 분석`(R5a) 옆 **`☁ 분석 요청`** 버튼 → `requestAnalysis()`:
  1. 대표 이미지(`themeState.imgId`) 없으면 토스트 안내 후 중단.
  2. `runForge()`로 보드 최신화 → `enqueue` POST `{docId, imgId, board:boardToGraph()}`.
  3. 폴링 시작, 버튼 → `분석 대기 중…`(비활성).
- 오프라인(`FORGE_API` 불가)이면 비활성 + 안내(메모리 모드엔 큐 없음).

### 폴링 UX

- `pollJob(jobId)` — **2.5s 간격** `jobs?docId=` 조회, 배지 갱신:
  - `pending` → 분석 대기 중 / `working` → 분석 중… / `done` → 결과 반영 + 토스트 / `error` → 실패 토스트 + 버튼 복구.
- **타임아웃 ~3분**(예: 72회) 후 미응답 → "워커 대기 중 — `/forge-analyze` 실행 필요" 안내 + 폴링 중지(잡은 큐 유지).
- 재방문 시 미완료 잡 있으면 폴링 자동 재개.

### 결과 반영

- `applyVision(result)`:
  - `series` → `_visionData = { price: series, n: series.length }`(데모 대체).
  - `bias` → `_visionBias`(§5 환산).
  - `waves`/`note` → 보관·표시.
  - `runForge()` 재호출 시 `data = _visionData || makeDemoSeries(...)`, `opts.visionBias = _visionBias` → `run`/`runSteps` 진짜 데이터로 재계산 → `fcDrawFuture` 갱신. **▷ 포지 분석 재생도 실데이터로 동작.**
  - 토스트 + 분석 출처 배지("AI 분석 반영 · {note}").
- **영속**: `_visionData/_visionBias/note/waves`를 `doc.vision`에 저장(`themeImgId` 옆) → 새로고침/재방문 유지(숫자 배열이라 <128KB).

## 5. 엔진 결합 (forge-core.js)

R5a 엔진 최소 변경 — 두 군데.

### 1) data 주입 — 변경 불필요

`run(graph, data, opts)`는 `data.price`를 그대로 사용. 클라이언트가 `data = _visionData || makeDemoSeries()`로 넘기면 끝. series(종가 배열)는 클라이언트에서 `{price, n}`으로 래핑.

### 2) visionBias 보정 — 한 줄

현재(forge-core.js:300): `const bias = aggregateConviction(graph), K = 0.5;`
변경:
```js
const vbias = (opts && typeof opts.visionBias === "number") ? opts.visionBias : 0;
const bias = aggregateConviction(graph) + vbias, K = 0.5;
```
- visionBias는 conviction과 동일 척도로 합산 → 기존 `bias*K` 경로 재사용(추가 공식 없음).
- `opts`는 `run`→`runSteps`로 이미 전달 → R5a 재생도 자동 보정.

### 3) 환산 규칙 (클라이언트, 한 곳)

```js
const SCALE = 60;  // strength 1.0 = conviction 60 상당(과하지 않게)
visionBias = (dir==="bull"?1 : dir==="bear"?-1 : 0) * strength * SCALE;
```

### 4) waves — MVP 비결합

`result.waves`는 표시/주석 전용(엔진 미투입). 엘리어트/phasefold 결합은 R5b-2 이후 → 결정성 유지.

### 불변식 / 테스트

- `visionBias=0`/미지정 → `run(graph,data)`와 deepStrictEqual(no-op).
- `visionBias>0`→verdict bull tilt, `<0`→bear(기존 conviction tilt와 동형).
- `runSteps`에 `opts.visionBias` 전달 → 마지막 step === `run(full, {visionBias})`.
- 기존 20 유지 → 총 22+.

## 6. 워커 스킬 (`.claude/commands/forge-analyze.md`)

프로젝트 슬래시 커맨드 `/forge-analyze` — Claude가 따르는 런북(결정적 코드 아님).

### 절차

1. **claim** — `curl -sX POST $FORGE_API -d '{"op":"claim"}'`. `job:null`이면 "대기 잡 없음" 보고 후 종료. 응답에서 `jobId/token/board/imgId` 확보.
2. **이미지 로드** — `GET $FORGE_API?images=1` → JSON 맵에서 imgId dataURL → base64 디코드해 스크래치패드 임시파일 저장 → `Read`로 비전 판독.
3. **전략 파악** — 잡의 `board`(nodes/edges) 읽기 → 판독 맥락으로만 사용.
4. **분석 생산(C 스키마)**:
   - `series`: 종가 곡선 균등 샘플링(좌→우, **200~400 다운샘플**, 차트 축 기준 가격 스케일). 본문 <128KB.
   - `bias`: dir(bull/bear/neutral) + strength(0~1).
   - `waves`: 눈에 띄는 파동/스윙 구간 `[{from,to,label}]`(없으면 []).
   - `note`: 1~2문장 근거(한국어). `coords: null`.
5. **result POST** — `{"op":"result",jobId,token,result}`. 실패/판독 불가 시 `{"op":"result",jobId,token,error}`.

### 설정 / 가드

- 커맨드 상단 `FORGE_API=https://parksvc.mycafe24.com/map/forge-api.php`. 쓰기키 설정 시 `-H "X-Write-Key: ..."`(키 로컬 only, 커밋 금지).
- **연속 처리**: 기본 1건. `/forge-analyze all` → `claim`이 `job:null` 날 때까지 반복(예약 루틴 대비).
- POST <128KB: series 길이/소수 자릿수 제한. 토큰 불일치(409)·이미지 없음 → 명확히 보고 후 중단.
- 산출물: `.claude/commands/forge-analyze.md` 한 파일 — **git 커밋**(레포 자산), cafe24 배포 X(워커는 로컬 세션).

## 7. 검증

- **엔진(node TDD)**: §5 불변식 2건 추가(기존 20 유지 → 22+).
- **큐 API**: enqueue→claim(token)→result(token 일치만 done) 왕복, 중복 가드, 잘못된 token→409, GC 20개, 오프라인 graceful.
- **클라이언트(헤드리스)**: `☁ 분석 요청`→폴링 배지 전이(pending/working/done)→결과 반영 후 `fcDrawFuture` 갱신 + `▷ 포지 분석` 재생이 실데이터로 동작. 콘솔 에러 0. reduced-motion·재방문 복원.
- **워커 E2E(로컬)**: 실제 잡 1건 claim→이미지 Read→결과 POST→페이지 반영 1회 확인.
- **배포**: `forge.html` + `forge-core.js` + `forge-api.php`(cafe24 `www/map/`). `forge_data.json`/`forge_images.json`/`forge_jobs.json` 불가침. `.claude/commands/forge-analyze.md`는 git만.

## 8. 비범위 (R5b-2 이후)

- 이미지 위 정밀 보조선(`result.coords` 활용, 픽셀 정렬) — 스키마 자리만 예약.
- waves 엔진 결합(엘리어트/phasefold 투입) — MVP는 표시만.
- 예약 루틴(`/schedule`) 자동 등록 — 동작 확인 후(`/forge-analyze all`로 대비).
- OHLC/거래량 추출, 멀티 이미지, 실시간 시세 연동.
- Claude API 직접 호출(B안) — 영구 비범위.

## 9. 리스크 / 주의

- **워커 의존**: 결과는 `/forge-analyze` 실행돼야 나옴 → 타임아웃 후 "워커 실행 필요" 안내, 잡 큐 유지.
- **비전 정밀도**: 차트 판독은 근사 — `note`로 근거 표시, 사용자가 보정/재요청 가능. "나중에 개선" 전제(스킬 수정으로 향상).
- **128KB 상한**: series 다운샘플 + `forge_jobs.json` GC로 관리.
- **원자성**: claim은 lock 안에서만 working 전환 + token → 중복 워커 안전.
- **결정성**: `visionBias=0`이면 기존과 완전 동일 → 비전 미사용 시 회귀 없음.
- 단일 페이지·바닐라·noindex·상대 `FORGE_API`·기존 자산(`map.html` 등) 불가침.

## 10. 산출물 요약

| 파일 | 변경 |
|---|---|
| `forge-api.php` | 큐 op 4종(enqueue/claim/result/jobs) + `forge_jobs.json` + GC |
| `forge-core.js` | `run`에 `opts.visionBias` 1줄 결합 + 테스트 2건 |
| `forge.html` | `☁ 분석 요청` 버튼 + 폴링 + `applyVision` + `doc.vision` 영속 |
| `.claude/commands/forge-analyze.md` | 워커 런북(신규) |
