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
   - 그 파일을 `Read` 로 열어 **비전으로 판독**: 종목 티커·거래소, 타임프레임(일/주/월봉), 가격 축(로그/선형)과 축 라벨 위치, '지금'(데이터 끝) 위치.
3. **실데이터 수집(정확화 핵심)**: 식별된 티커로 **실제 과거가를 받아 `series` 로 쓴다**(눈대중 금지). 무키 소스:
   ```bash
   # 예: TSLA 월봉. interval=1mo|1wk|1d, range=max
   curl -s -H "User-Agent: Mozilla/5.0" \
     "https://query1.finance.yahoo.com/v8/finance/chart/TSLA?interval=1mo&range=max"
   # JSON.chart.result[0].indicators.quote[0].close (null 제거) = 실제 종가배열
   # meta.regularMarketPrice / fiftyTwoWeekHigh 로 이미지 현재가·고점과 대조해 종목/축 검증
   ```
   - **검증**: 받은 마지막 종가·52주고점이 이미지의 현재가·High와 맞는지 확인(틀리면 티커/타임프레임 재식별).
   - 티커 식별 불가/소스 실패 시에만 **비전 샘플링으로 폴백**(차트 곡선 균등 추출, `note`에 "근사" 명시).
4. **전략 파악**: `job.board` 노드/엣지로 분석 의도만 맥락 활용(결과를 좌우하진 않음).
5. **분석 생산 (C 스키마)** — JSON:
   - `series`: 실제 종가 배열(3단계). POST <128KB 되게 길이/자릿수 제한(보통 정수, <10은 소수2자리).
   - `bias`: `{ "dir": "bull"|"bear"|"neutral", "strength": 0~1 }` — 최근 모멘텀·구조 기반(데이터에서 산출 권장).
   - `timeframe`: 타임프레임 한글 라벨(예: `"월봉(1M)"` / `"주봉"` / `"일봉"`).
   - `futBars`: 예측 봉 수(타임프레임에 맞게: 월봉≈24, 주봉≈26, 일봉≈30). 미지정 시 클라가 120.
   - `coords`: 이미지 가격축 정렬용. `{ "log": true|false, "p1": {"price":P, "yf":0~1}, "p2": {"price":P, "yf":0~1}, "nowXf":0~1, "rightXf":0~1 }` — 두 축 기준의 (가격, y픽셀비율) + '지금' x비율 + 예측영역 우측 x비율. **눈대중 금지 — 픽셀 정밀측정**: numpy+PIL로 (1) 우측 축 가격 라벨 배지 색검출(파란 High/Low, 빨간 현재가) → 배지 y중심/이미지높이 = yf, (2) '지금' 세로 점선 = 세로로 색픽셀 최다 열 → x/너비 = nowXf, (3) 예측영역 우측 = 축 라벨 시작 직전. 로그축 여부는 라벨 간격이 등비면 log=true. 측정 불가 시에만 `null`.
     ```python
     import numpy as np; from PIL import Image
     im=np.asarray(Image.open(p).convert("RGB")).astype(int); H,W,_=im.shape; R,G,B=im[:,:,0],im[:,:,1],im[:,:,2]
     ax=slice(int(W*.88),W); blue=(B>110)&(B-R>35)&(B-G>20); red=(R>150)&(R-G>70)&(R-B>70)   # 배지: row별 sum의 밴드 중심 = yf
     gold=(R>150)&(G>110)&(G<200)&(B<120); gray=(np.abs(R-G)<40)&(np.abs(G-B)<40)&(R>55)&(R<150)  # 세로선: col별 sum 최다 = nowX
     ```
   - `waves`: 파동/스윙 `[{from,to,label}]`(series 인덱스). 없으면 `[]`.
   - `note`: 1~2문장 한국어 근거(실데이터/근사 여부 명시).
6. **result POST**:
   `curl -s -X POST "$FORGE_API" -H "Content-Type: application/json" -d '{"op":"result","jobId":"<id>","token":"<token>","result":{...}}'`
   - 판독 불가/오류 시: `-d '{"op":"result","jobId":"<id>","token":"<token>","error":"<사유>"}'`.
   - 응답 `{"ok":true}` 확인.
7. **인자 `all`**: 1~6를 `claim` 이 `job:null` 을 줄 때까지 반복.

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
