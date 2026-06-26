# 스쿱포지 (Scoop Forge) Phase 1.5 — 설계 문서

- 날짜: 2026-06-26
- 선행: [MVP-1](2026-06-26-scooplab-design.md) 완성·배포(`map/forge.html` + `map/forge-core.js`)
- 상태: 컨셉 합의 완료 → 구현 설계

## 1. 목표

MVP-1에서 미충족된 "전략을 진짜로 **튜닝**한다" + "리서치 맥락(주제/참고 이미지)을 얹는다"를 추가한다. 네 갈래:
- **A. 파라미터 편집기** — 노드 선택 시 계산 파라미터(수치) + 확신 바이어스(수치) + 서술 메모(텍스트)를 편집, 라이브 재계산.
- **B. 인터프리터 확신 바이어스** — 노드별 conviction을 합성 시그널/국면에 반영(`forge-core.js`, node 테스트).
- **C. 주제 배너** — 보드 상단 고정 배너에 주제 이미지(크게) + 제목.
- **D. 썸네일 라이브러리 + 노드 이미지** — map.html 라이브러리 시스템 포팅 + Ctrl+V 붙여넣기.

기존 `map/map.html`·`map/chart.html` 불가침. 바닐라 JS, 다크 골드 테마, 단일 페이지(+`forge-core.js`).

## 2. A — 파라미터 편집기

- 단일 노드 선택 시 편집 패널 노출(보드 우상단 플로팅 카드 `.forge-params`, 또는 노드 위 팝오버). 다중/무선택 시 숨김.
- **계산 파라미터(블록별, 수치):**
  - `ma` → `len`(정수, ≥1)
  - `phasefold` → `pmin`, `pmax`(정수, pmin<pmax)
  - `combine` → 입력 엣지별 `weights[srcId]`(숫자) — 입력 노드 라벨과 함께 행으로 표시
  - `price`/`predict` → 계산 파라미터 없음(확신/메모만)
- **확신 바이어스:** 모든 블록·자유 노드 공통 — `conviction` 슬라이더/숫자(−100~+100, 기본 0).
- **서술 메모:** 모든 노드 공통 — `note`(자유 텍스트). 계산 무관, 근거·기준 기록용.
- 값 변경 → `n.params`/`n.conviction`/`n.note`에 저장 → `fireBoardChange()` → 180ms 라이브 재계산(기존 파이프 재사용).
- 노드 데이터 모델 확장: `node.conviction:number=0`, `node.note:string=""`. `params`는 기존대로 블록별 수치.

## 3. B — 인터프리터 확신 바이어스

- `forge-core.js`에 conviction 집계 추가. **계약:**
  - `ForgeCore.run(graph, data, opts)` 결과의 `signal`/`verdict`에 노드 conviction이 반영된다.
  - 집계: 계산에 참여하는 블록(+선택적으로 자유 노드) 중 `conviction!=0`인 값들의 평균 `biasAvg`(−100~+100).
  - 적용: `signalBiased[t] = clamp(signal[t] + biasAvg*k, -100, 100)` (k=계수, 예: 0.5). `verdict.score`/`regime`도 바이어스된 시그널 기준 재계산. `prediction`은 영향 없음(가격 추세 기반 유지) — **단순·예측가능**.
  - conviction 전부 0이면 기존과 동일(하위호환).
- **결정적·DOM-free·node 테스트:** conviction 양수 그래프 → 동일 그래프 conviction 0 대비 `verdict.score` 증가, `signal` 평균 증가, 모든 값 [−100,100] 유지. conviction 0 → 기존 결과 불변.

## 4. C — 주제 배너

- 보드 페인 상단에 고정 배너(`.forge-theme`): 좌측 큰 주제 이미지(`themeState.imgId`) + 우측 편집가능 제목(`themeState.title`, contenteditable).
- 이미지 없을 때: "주제 이미지 붙여넣기(Ctrl+V) 또는 라이브러리에서 드래그" 플레이스홀더.
- 배너 높이 고정(예: 96px), 이미지는 contain. 배너는 보드 캔버스 위 레이어(팬/줌 무관, 항상 표시). 보드 stage 영역은 배너 아래로.
- `themeState = { imgId:string|null, title:string }`. JSON 내보내기에 포함.

## 5. D — 썸네일 라이브러리 + 노드 이미지

- map.html 라이브러리 시스템 포팅(빌트인 샘플 **없음** — 파일 경량 유지, KB-VDI 이미지 미포함):
  - 보드 좌측 접이식 패널(`.forge-lib`): "＋ 이미지 추가" 버튼 + 썸네일 목록.
  - 썸네일을 노드로 **드래그 적용**(드롭 대상 노드의 `thumb`로 설정). OS 이미지 파일 드롭도 지원.
  - `LIBRARY = [{id,label}]`, 실제 dataURL은 `IMAGES` 맵(메모리). map.html의 `downscaleImage`(최대 1000px·JPEG)로 다운스케일 후 보관.
- **노드 썸네일 렌더:** block/free 노드 카드에 `n.thumb`가 있으면 상단 썸네일 표시(map.html `nodeHTML` 썸네일 패턴 참고). 클릭=라이트박스(선택 구현, YAGNI면 생략).
- **Ctrl+V 붙여넣기:** `paste` 이벤트의 이미지 클립보드 → `downscaleImage` → `IMAGES`/`LIBRARY` 등록 →
  - 단일 노드 선택 중: 그 노드 `thumb`에 적용.
  - 무선택: 주제 배너 이미지(`themeState.imgId`)에 적용.
- **데이터 모델:** `node.thumb = {imgId, label} | null` (map.html과 동일 참조 방식). `imgSrc(imgId)`로 렌더 시 조회.
- **영속:** 메모리 + JSON 내보내기에 `IMAGES`(사용 중 id만)·`LIBRARY`·`themeState`·노드 `thumb` 포함. 서버 저장은 범위 밖(추후 Phase 3).

## 6. 비범위(이번 제외)

- 서버 저장(api.php 연동) — 이미지/주제/파라미터는 메모리 + JSON 내보내기까지만.
- 조건/분기 블록, 실데이터 연동(추후 Phase).
- 이미지 라이트박스 줌은 선택(없어도 됨).

## 7. 리스크 / 주의

- **파일 크기:** 빌트인 base64 금지(사용자 이미지만 런타임 dataURL). downscaleImage로 개별 이미지 경량화.
- **네임스페이스:** 라이브러리/이미지 포팅 시 forge.html 기존 전역(board `b*`/chart `fc*`/overlay `_*`)과 충돌 금지. 라이브러리는 `lib*`/`IMAGES`/`LIBRARY`로.
- **Ctrl+V 충돌:** contenteditable(노드 제목/메모/주제 제목)에 포커스 중일 때의 paste는 텍스트 붙여넣기를 막지 말 것(이미지 클립보드일 때만 가로채기).
- **확신 바이어스 하위호환:** conviction 미지정/0이면 기존 결과 불변(기존 node 테스트 유지).
- noindex 유지. 라이브러리 패널/배너 `body.view`(있다면) 보기모드 처리 일관.

## 8. 테스트

- `forge-core.js` 확신 바이어스: node 테스트(결정적) — conviction 0 불변, 양수 증가, 클램프 유지.
- 나머지(편집기·배너·라이브러리·붙여넣기): 헤드리스 스크린샷 + 구조 검증(컨트롤러).

## 9. 확정된 결정

1. 주제 이미지: **보드 상단 배너 패널**.
2. 서술/확신: **확신 가중 바이어스로 합성 시그널에 반영**(서술 텍스트는 메모).
3. 라이브러리: **map.html 풀 시스템 포팅, 빌트인 샘플 없음(경량)**.
4. Ctrl+V: 노드 선택 중→노드 썸네일 / 무선택→주제 배너.
5. 영속: 메모리 + JSON 내보내기(서버 저장 범위 밖).
