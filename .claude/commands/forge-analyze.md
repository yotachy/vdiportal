---
description: 스쿱포지 비전 분석 워커 — 큐에서 잡을 claim해 대표 이미지+전략을 읽고 결과를 POST
---

# /forge-analyze

스쿱포지(Scoop Forge) 작업큐의 분석 잡을 처리하는 워커. **Claude API를 호출하지 않는다** — 너(이 세션)가 직접 비전으로 차트를 읽고 결과를 큐에 POST 한다.

설정: `FORGE_API=https://parksvc.mycafe24.com/map/forge-api.php`
인자: `$ARGUMENTS` 가 `all` 이면 잡이 없을 때까지 반복, 아니면 1건만 처리.

## 절차

1. **claim**: `curl -s -X POST "$FORGE_API" -H "Content-Type: application/json" -d '{"op":"claim"}'`
   - 응답 `job` 이 `null` 이면 "대기 중인 분석 잡 없음" 보고 후 종료.
   - 응답에서 `job.id`, `token`, `job.imgId`, `job.docId`, `job.board`(전략 nodes/edges) 확보.
   - **주의**: result POST 시 `job.id`를 `jobId` 로 사용 (5단계 참조).
2. **이미지 로드**: `curl -s "$FORGE_API?images=1"` 로 전체 이미지 맵을 받아 `job.imgId` 키의 dataURL을 꺼낸다.
   - dataURL의 base64 본문을 디코드해 스크래치패드에 임시 파일로 저장(예: `.../forge_img.jpg`).
   - 구체 명령:
     ```bash
     IMGID="<job.imgId>"  # claim 응답에서 확보
     curl -s "$FORGE_API?images=1" \
       | jq -r --arg k "$IMGID" '.[$k]' \
       | sed 's/^data:[^,]*,//' \
       | base64 -d > /tmp/claude-*/scratchpad/forge_img.jpg
     # 확장자는 dataURL MIME에 맞게 (보통 .jpg/.png)
     ```
   - 그 파일을 `Read` 로 열어 **비전으로 가격 차트를 판독**한다.
3. **전략 파악**: `job.board` 의 노드(블록 종류·메모·conviction)와 엣지를 읽어 어떤 분석 의도인지 맥락으로만 활용(결과를 좌우하진 않음).
4. **분석 생산 (C 스키마)** — 아래 JSON 을 만든다:
   - `series`: 차트의 종가 곡선을 왼→오른쪽으로 **균등 샘플링한 종가 배열**. 200~400 포인트로 다운샘플, 가격은 차트 축 스케일 기준 실제 값(정수 또는 소수 2자리). POST 본문이 128KB 미만이 되도록 길이/자릿수 제한.
   - `bias`: `{ "dir": "bull"|"bear"|"neutral", "strength": 0~1 }` — 추세·구조 종합 방향 판단.
   - `waves`: 눈에 띄는 파동/스윙 구간 `[{ "from": idx, "to": idx, "label": "..." }]`(series 인덱스 기준). 없으면 `[]`.
   - `note`: 1~2문장 한국어 판독 근거.
   - `coords`: `null` (R5b-2 예약).
5. **result POST**:
   `curl -s -X POST "$FORGE_API" -H "Content-Type: application/json" -d '{"op":"result","jobId":"<id>","token":"<token>","result":{...}}'`
   - 판독 불가/오류 시: `-d '{"op":"result","jobId":"<id>","token":"<token>","error":"<사유>"}'`.
   - 응답 `{"ok":true}` 확인.
6. **인자 `all`**: 1~5를 `claim` 이 `job:null` 을 줄 때까지 반복.

## 가드

- 쓰기 키가 설정돼 있으면 모든 POST 에 `-H "X-Write-Key: <키>"` 추가(키는 로컬에만, 커밋 금지).
- **토큰 불일치(409)** → 다른 워커가 소유, 그 잡은 건너뛴다 (**POST 금지**, 고착 위험).
- **이미지 없음(404·null)** → 복구 불가 오류, 반드시 error POST로 슬롯 해제:
  ```
  curl -s -X POST "$FORGE_API" \
    -H "Content-Type: application/json" \
    -d '{"op":"result","jobId":"<job.id>","token":"<token>","error":"이미지 없음: <imgId>"}'
  ```
  그래야 서버가 `job.status`를 error로 마크하고 슬롯을 회수한다.
- POST 본문 <128KB 엄수(series 길이/자릿수로 조절).
- 차트 판독은 근사치임을 `note` 에 드러낸다.
