# 캔버스(다이어그램) 다중 관리 + 서버 저장 — 설계

- 날짜: 2026-06-24
- 대상: `map/map.html` (KB VDI 접속 흐름 다이어그램 빌더)
- 목적: 단일 캔버스 → 여러 캔버스 추가/편집/삭제/전환, 서버에 영속 저장

## 배경

현재 `map.html`은 단일 파일 정적 HTML(바닐라 JS, 무빌드)로, 다이어그램 1개를 메모리에 보관하고 JSON 내보내기/불러오기로만 영속화한다. 운영(cafe24, `www/map/`)에 배포된 상태이며, 사용자는 여러 다이어그램을 만들어 관리하고 서버에 자동 저장하길 원한다.

기존 정책 정합:
- "localStorage 금지"(claude.ai 미리보기 비호환) → **위반 아님**. localStorage를 쓰지 않고 서버(PHP) 저장을 사용한다.
- "단일 파일 유지" → `map.html`은 단일 유지. 백엔드 `api.php` 1개 추가(같은 저장소 `vdi-log/api.php`·`signal/api.php`와 동일한 구조적 양해).

## 결정 사항 (사용자 확정)

1. 저장 방식: **서버 저장(PHP 백엔드)**. 정성인연/vdi-log의 `api.php` 패턴 차용.
2. 쓰기 권한: **지금은 개방**(키 없음). 추후 로그인 기능으로 개선. 단 키 파일이 있으면 자동 강제(fail-open).
3. 저장 시점: **자동저장(디바운스)**.
4. 사이드바 배치: **캔버스 목록 상단 + 썸네일 라이브러리 아코디언 하단**.

## 아키텍처

3개 파일, 배포 경로 `www/map/`:

| 파일 | 역할 | 배포 |
|---|---|---|
| `map.html` | 프론트(단일 파일 유지) | 매번 업로드 |
| `api.php` | 서버 저장 API (op 기반) | 매번 업로드 |
| `map_data.json` | 서버 관리 데이터, 첫 쓰기 시 자동 생성 | **배포 시 절대 덮어쓰지 않음** (jsiy 불가침 규칙과 동일) |

### Graceful degradation (필수)

`api.php`에 접근 불가 시(예: `file://`로 직접 열기, 또는 서버 오류) → 자동으로 **메모리 모드**로 폴백:
- 현재 동작(단일 캔버스, defaultState)과 동일하게 동작.
- 자동저장은 no-op, 헤더 상태는 "오프라인" 표기.
- JSON 내보내기/불러오기는 계속 동작.
- → "파일을 브라우저로 직접 열면 동작" 원칙 유지.

## 서버 데이터 모델 (`api.php`)

```
doc = {
  canvases: [ { id, title, nodes, edges, groups, view, updated } ],
  meta:     { library: [ { id, label, src } ], activeId },
  _rev:     N
}
```

- `canvases[]`: 캔버스 목록. 각 캔버스는 자체 `nodes/edges/groups/view`를 가짐. `updated`는 마지막 수정 시각(클라이언트가 채움; 서버는 시각 생성 안 함).
- `meta.library`: 전역 공유 썸네일 라이브러리(dataURL).
- `meta.activeId`: 마지막 활성 캔버스 id(재방문 복원용).
- `_rev`: 매 쓰기마다 증가(변경 감지·향후 폴링용).

### 연산(op) — vdi-log/api.php 패턴 그대로

- `GET` → 저장된 doc 반환(없으면 `null`). 읽기 공개.
- `GET ?check=1` → 쓰기 키 유효성(키 파일 있을 때만 의미).
- `POST {op:"replace", doc}` → 전체 교체(시드/불러오기).
- `POST {op:"upsert", canvas}` → id 기준 캔버스 추가/수정(**자동저장 대상**).
- `POST {op:"delete", id}` → 캔버스 삭제.
- `POST {op:"reorder", order:[id...]}` → 캔버스 순서 재배치.
- `POST {op:"meta", meta:{...}}` → meta 일부 병합(library, activeId).
- 응답: `{ok:true, rev:N}` 또는 `{ok:false, error}`.

### 동시성·무결성

- 파일락(`flock LOCK_EX`) + 임시파일 write 후 `rename`(원자적). vdi-log와 동일.
- `_rev` 증가.

### 인증 (fail-open, 향후 강화)

- 서버에 `map_key.txt`가 **있으면** POST에 `X-Write-Key` 일치 강제(403 on mismatch).
- 없으면 쓰기 개방. → 로그인 기능 추가 시 키 파일만 올리면 보호 활성화.
- (주의: vdi-log는 키 없으면 fail-closed. 여기선 "나만 쓰는 중"이라 의도적으로 fail-open.)

## 프론트 구조 (`map.html`)

### state ↔ 캔버스 연결

- 전역 `state`(`{nodes,edges,groups}`)와 `view`는 **활성 캔버스의 작업본**.
- 인메모리 `canvases[]`(서버 doc.canvases 사본) + `activeId`.
- `LIBRARY`는 전역 공유(서버 meta.library와 동기화).
- 캔버스 전환: 현재 작업본을 활성 캔버스 항목에 write-back(`c.nodes=state.nodes` 등 + `c.view=view`) → 대상 캔버스를 `state`/`view`에 로드 → `render()` → `fitView()` → `meta.activeId` 저장(debounce).

### 자동저장

- `markDirty()`: 활성 캔버스에 현재 `state`/`view` write-back + `updated` 갱신 → 디바운스(~800ms) 후 `upsert` 전송.
- 호출 지점(확정 목록):
  - 노드 드래그 종료(`onUp` type==='node')
  - `focusout`(제목/설명/그룹 라벨)
  - `makeNode`(단, 전환/시드 시엔 별도 처리), `addEdge`, `delEdge`, `delNodes`, `setThumb`
  - `addSibling`, `addChild`, `addParent`, `makeGroup`, 그룹 삭제
  - 엣지 끝점 이동(`onUp` type==='endpoint'), 방향전환(`data-erev`)
  - `autoLayout`
- 라이브러리 변경(이미지 추가/삭제) → `meta` op로 별도 저장.
- 저장 상태 표시: 헤더에 "저장됨 / 저장 중… / 오프라인" 인디케이터.

### API 클라이언트

`api` 객체: `load()`, `saveCanvas(canvas)`(upsert, 디바운스), `deleteCanvas(id)`, `reorder(order)`, `saveMeta(meta)`, `replaceAll(doc)`. fetch 실패 시 메모리 모드 플래그 설정 + 상태 표기.

### 초기 로드 흐름

1. `api.load()` → GET doc.
2. doc에 canvases 있으면: `canvases`/`LIBRARY`/`activeId` 복원 → 활성 캔버스 로드.
3. doc이 null/빈 경우(첫 방문): `defaultState()`로 캔버스 1개 시드 + 내장 LIBRARY → `replace`로 서버 초기화.
4. GET 실패: 메모리 모드(현 동작) + 토스트 안내.

## 사이드바 UI (확정 배치)

```
┌─ 사이드바 ─────────────┐
│ 캔버스            ＋ 새 캔버스 │  ← 상단: 1차 내비게이션
│ ● VDI 접속 흐름   ✎ ✕  │
│ ○ 결재 흐름       ✎ ✕  │
│ ○ 장애 처리       ✎ ✕  │
├────────────────────────┤
│ ▸ 썸네일 라이브러리      │  ← 하단: 아코디언(기본 접힘)
│   (펼치면 기존 썸네일 그리드)│
└────────────────────────┘
```

- 캔버스 항목: 클릭=전환, 활성=골드 강조, 이름 인라인 편집(=편집), `✕`=삭제(confirm, **마지막 1개는 삭제 불가**).
- `＋ 새 캔버스`: 빈 캔버스(또는 최소 노드 1개) 생성 → 전환.
- 썸네일 라이브러리: 기존 기능 그대로, `<details>`(또는 동등) 아코디언으로 접어둠(기본 접힘).
- 사이드바 접기(collapse) 동작 유지. 접힘 상태에선 캔버스 목록도 숨김(레일만).
- 디자인 토큰(`:root` 변수)·다크+골드 테마 준수. 신규 id는 `uid()`.

## 보존해야 할 기존 제약

- 엣지 SVG 구조(`-10000/20000/overflow:visible` + `#edgeG translate`) 유지.
- `.world`에 `will-change:transform` 넣지 않기.
- `nodeAt()` 좌표 판정 유지(`elementFromPoint` 금지).
- 불러오기 시 `fromSide/toSide` 기본값 보정 유지.
- localStorage/sessionStorage 사용 안 함(서버 사용).

## 배포

- `map.html` + `api.php`를 `www/map/`에 업로드.
- `map_data.json`은 서버 관리 — 배포 시 삭제/덮어쓰기 금지(jsiy 불가침 규칙 동일).
- 커밋+push+배포 한 세트.

## 문서 갱신

- `map/CLAUDE.md`: 파일명 `map.html`로 정정, 서버저장(api.php/map_data.json) 섹션 추가, 캔버스 관리 인터랙션 추가, "file:// 직접 열기 → 메모리 모드" 명시.

## 범위 밖 (YAGNI / 향후)

- 다중 사용자 실시간 동기화(폴링) — `_rev`만 둠, 폴링은 미구현.
- 로그인/인증 UI — 키 파일 훅만 준비.
- 캔버스별 썸네일 스냅샷, 캔버스 복제, 폴더/태그 분류.
- 캔버스 목록을 메타만 먼저 로드 후 지연 로드(현재는 전체 doc 일괄 로드; 캔버스 수 적어 충분).
- PNG/SVG 내보내기.
