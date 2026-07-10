# PotFlow — 책갈피 ▶재생 · 후원 · 사생활 · 무료/유료 라이센스 · 설계 문서

- 작성일: 2026-07-10
- 대상: `map/potflow.html` + `map/potflow-helper.py`
- 선행: potflow 본체 + 직접드래그/정렬 + 책갈피(PBF) 하위노드 완료본.

---

## A. 책갈피 노드 ▶버튼/Space도 "그 지점부터"

현재 `playSelected`(▶ 선택 재생·Space)는 선택 노드의 `videoPath`만 모아 **처음부터** 재생. 책갈피 노드(`seekMs` 보유)도 그 지점부터 열리게 한다.

- **헬퍼 `/play` 확장**: `items:[{path, seek}]` 형태 수용(기존 `{paths, seek}` 호환 유지). 각 항목을 자기 seek로 실행 + 개수만큼 타일 배치.
  - 순수 `normalize_play_items(body) -> [{"path","seek"}]`: `body.items`가 있으면 그대로(문자열 path·number/None seek), 없으면 `[{path:p, seek:body.seek} for p in body.paths]`.
  - `launch_players(items)`로 리팩터(내부에서 `player_cmd(exe, path, seek)`; seek는 항목별). 다중이어도 각 seek 적용(단일 seek 제약 폐지). 종료추적 token은 종전대로.
- **클라이언트**: `playItems(items, watchId?)` 추가. `playSelected`가 선택 노드별 `{path:videoPath, seek: seekMs!=null? seekMs/1000 : null}`(videoPath 없는 노드 제외)로 items 구성→`playItems`. `playAt`/`playPaths`는 유지(내부적으로 items 경유해도 무방).

## B. 후원하기 버튼 (헤더)

- 헤더 `.tools`에 **"♥ 후원하기"** 버튼 → 팝오버/모달(`#supPop`). 내용:
  - **후원 계좌**: 상수 `SUPPORT_ACCOUNT`(현재 자리표시자 `"OO은행 000-000000-00 · 예금주 OOO"`) + **복사** 버튼(`navigator.clipboard`, 실패 시 select fallback) + 감사 문구.
  - 같은 모달 하단에 **라이센스(PRO 해제)** 섹션(아래 D) 통합.
- 팝오버는 기존 `.menupop`/`toggleExportPop`/`closeMenus` 패턴 재사용(`closeMenus` 목록에 `supPop` 추가).

## C. 사생활 보호

- `<meta name="robots" content="noindex,nofollow">` — **이미 존재(line 6)**. 유지.
- **데이터 로컬 전용**(현행 확인·명문화): 공개 cafe24판은 로컬 헬퍼가 없어 `pingHelper` 실패→localStorage 모드. 노드·경로·책갈피가 외부 서버로 전송되지 않음. 후원/PRO 모달 하단에 안내 한 줄 `"모든 데이터는 이 브라우저/PC에만 저장됩니다."`.
- (호스트 `robots.txt`는 배포 인프라 별도 안내 — 코드 범위 밖.)

## D. 무료 / 유료 (간이·명예제)

### 제한
| | 무료 | PRO(유료) |
|---|---|---|
| 캔버스 | 1개 | 무제한 |
| 영상(루트, `videoPath` 보유·`bmParent` 없음) 노드 | 1개 | 무제한 |
| 노드당 하위(자식) | ≤2 (1:2) | 무제한 (1:N) |

### 상태 / 라이센스
- `PRO` 전역 = `lsGet('potflow_pro')==='1'`(boot에서 초기화). 헤더에 PRO면 **"PRO" 배지**.
- **자체검증 키**: 형식 `PF-XXXX-XXXX`(대문자 영숫자). 검증:
  ```js
  const LIC_SALT="potflow-2026-🔒";           // 소스 노출(명예제)
  function _licHash(s){let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return (h>>>0).toString(36).toUpperCase().padStart(4,'0').slice(0,4);}
  function licenseValid(key){const m=/^PF-([A-Z0-9]{4})-([A-Z0-9]{4})$/.exec((key||'').trim().toUpperCase());return !!m&&_licHash(m[1]+LIC_SALT)===m[2];}
  ```
  키 발급(오프라인, 동일 알고리즘): 임의 4자 `A` → `B=_licHash(A+LIC_SALT)` → `PF-A-B`. (콘솔에 `licenseKeyFor` 헬퍼 동봉해 발급 편의.)
- `unlockPro(key)`: 유효 → `PRO=true; lsSet('potflow_pro','1')` + 배지·제한해제 + 토스트 `'PRO 활성화'`; 무효 → 토스트 `'잘못된 키'`. 모달에 현재 상태 표시.
- ⚠️ 클라이언트 검증이라 소스 우회 가능(명예제 — 합의).

### 게이팅(초과 시 차단 + 안내 토스트 + 후원/PRO 모달 오픈)
헬퍼: `isPro()`·`videoNodeCount()`(videoPath && !bmParent)·`childCount(id)`(edges from id) 유틸.
- **캔버스**: `newCanvas`에서 `!isPro() && canvases.length>=1` → 차단, 토스트 `'무료는 캔버스 1개 · PRO에서 여러 개'`.
- **영상 노드**: `bindVideoToNode`에서 대상이 새 영상이 되며 `!isPro() && videoNodeCount(제외 자신)>=1` → 경로 미지정 + 토스트 `'무료는 영상 1개 · PRO에서 여러 개'`. (드롭 핸들러가 방금 만든 빈 노드는 그대로 두거나 사용자가 삭제.)
- **하위 노드(1:2)**: `addChild`/`addChildMini`/`addParent`(부모측 자식 수)·`syncBookmarks`(책갈피 자식은 2개까지만 생성, 초과분은 미표시 + 토스트 `'무료는 책갈피 2개 · PRO에서 전체'`)에서 `!isPro() && childCount(parent)>=2` → 차단.
- 게이팅 실패 시 `openSupport()`(후원/PRO 모달)로 유도.

> 참고: 현재 기본 예시 다이어그램은 `videoPath` 없는 안내 노드라 무료 제한에 안 걸린다(노드당 자식도 ≤2). 그대로 열림.

## 디자인/제약
- 바닐라 JS·단일 파일·표준라이브러리만. **좌측 accent 라인 금지**. 한국어 UI. Host 가드·CORS 유지.
- 수정 파일: potflow-helper.py / potflow.html / test_potflow_helper.py.
- 배포: 기존과 동일(cafe24 `www/map/`, git+배포 한 세트).

## 테스트
- 헬퍼: `normalize_play_items` 순수함수(items 우선 · paths 폴백 · seek 매핑).
- 클라: `node --check` + 헤드리스(후원 팝오버·PRO 배지 렌더, 게이팅 토스트 구조). 실제 재생/키 발급은 로컬 수동.

## 범위 밖 (YAGNI)
- 서버 계정/PG 결제(추후). host robots.txt. 접근 비밀번호(미채택). 다중 캔버스 간 라이센스 동기화.
