# cafe24 백업 복원 신청 자료 (2026-07-17 삭제 사고)

## 계정 정보
- 호스팅 계정: `parksvc` (parksvc.mycafe24.com)
- 사고 발생: **2026-07-17 오전 ~10:15 (KST)** — 배포 스크립트가 www/ 하위 디렉토리 삭제
- **요청 복원 시점: 2026-07-16 (또는 2026-07-17 오전 10시 이전) 백업본**

## ⚠️ 복원 방식 요청 (중요)
**www/ 전체 복원은 절대 불가** — 사고 이후 정상 재배포·개편된 파일들이 롤백됨.
아래 **지정 파일만** 복원 요청. 파일 단위 복원이 불가하면:
1. 임시 경로(예: `www/_restore/`)로 복원해 달라고 요청하거나,
2. 해당 파일만 다운로드 제공 요청.

## 복원 대상 파일 (우선순위순)

### 1순위 — 사용자 실데이터 (대체 불가)
| 경로 | 내용 |
|---|---|
| `www/map/forge_data.json` | 스쿱포지 — 사용자가 만든 포지(전략 문서) 전체 |
| `www/map/forge_images.json` | 스쿱포지 — 업로드한 이미지 라이브러리 |
| `www/portal/vdi-log/jsiy_data.json` | 정성인연 자산관리 — 실사용 최신 데이터 |
| `www/map/map_data.json` | 스쿱보드(다이어그램 빌더) — 문서 데이터 |
| `www/map/map_images.json` | 스쿱보드 — 이미지 라이브러리 |

### 2순위 — 서버 생성 키/토큰 (재발급 가능하나 있으면 좋음)
| 경로 | 내용 |
|---|---|
| `www/map/forge_key.txt` | forge-api 서버 키 |
| `www/map/map_key.txt` | map api 서버 키 |
| `www/portal/vdi-log/jsiy_key.txt` | 정성인연 api 키 |

### 3순위 — 있으면 복원, 없어도 무방
| 경로 | 내용 |
|---|---|
| `www/map/forge_jobs.json` | 비전 분석 작업큐 (일회성) |
| `www/portal/signal/api.php` | ScoopSignal 프록시 — 서버본에만 API 키 주입됐을 수 있음 (로컬본은 빈 슬롯) |

### 복원 불필요 (이미 로컬 사본으로 복구 완료)
- `www/map/forge_td_key.txt` — 재업로드 완료
- `www/map/*.html`, `*.js`, `*.php`, `fonts/` — 전부 재배포 완료
- `www/portal/` 정적 파일 전체, `www/resume/` 전체 — 재배포 완료
- `www/map/forge_ohlc_cache_*.json` — 캐시, 자동 재생성됨
- park 본체(`www/` 루트·`data/`·`uploads/`) — 삭제 대상 아니었음 (안전)

## 복원 후 확인 절차
1. `https://parksvc.mycafe24.com/map/forge.html` — 사이드바에 기존 포지 목록 복귀 확인
2. `https://parksvc.mycafe24.com/portal/vdi-log/up.html` — 정성인연 항목 복귀 확인
3. 키 파일을 복원 못 받았으면 첫 저장 시 api.php가 새 키 재생성 (기존 클라이언트 재인증 필요할 수 있음)
