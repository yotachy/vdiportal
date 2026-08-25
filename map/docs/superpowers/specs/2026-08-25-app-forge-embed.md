# 앱 차트 = forge.html 임베드 (설계, 2026-08-25)

## 문제
앱 차트(`app-chart.js`, SVG 재구현)는 PC 차트(`forge-draw.js` 캔버스)의 **평행 구현**이라 작도·콘·축 조작·시뮬레이션 품질이 PC 에 못 미치고, 엔진이 진화할수록 두 그림이 갈라진다. 사용자 요구: "forge.html 차트 수준으로 작도·축 조작·확대축소·시뮬레이션이 모바일에서 동일하게".

## 결정
**forge.html 을 `?embed=app` 모드로 앱 안에 iframe 으로 실행한다.** CLAUDE.md §④-3 전제("별도 모바일 개발 없음 — forge.html 과 스크립트를 그대로 실행")를 문자 그대로 적용한다.
- 같은 코드 = 같은 그림: 캔들·콘·32종 근거 레이어·손그림 시연·핀치줌·팬·축 드래그·fit 전부 PC 와 동일(이미 모바일 제스처 구현 있음).
- 엔진 변경 시 앱 차트가 자동으로 따라온다(사본 없음). 앱 SVG 차트는 폐기(P2 산물).
- 임베드 모드는 **추가·게이트만**(EMBED 플래그) — PC 동작 무변경. 저장(markDirty/writeBack/saveMeta) 전면 차단, 서버 문서 로드 없음.

## 계약 — postMessage (`src:"forge-embed"`)
앱 → 프레임: `load{symbol,tf,tier,weights}` · `play` · `stop` · `evidence{on}` · `fit` · `tf{tf}` · `theme{key}` · `lock{on}`
프레임 → 앱: `ready` · `result{sym,tf,verdict,prediction}` · `step{idx,total,type,label,sIdx,sTotal,text,last}` · `done` · `stopped` · `error{msg}`
- tier: basic = `IND_TIERS[0]` 5종만 보드에 남김 / deep·custom = 32종 전부. weights = `_driftW`(타입별 배율) — 앱 `composeWeights`(+페르소나 그룹 배율) 결과를 그대로 넘긴다.
- tf: `1day|1week|1month`(앱 일/주/월 ↔ 매핑은 앱 측).

## 파일
- forge(원본, 추가만): `forge-state.js`(EMBED·저장 게이트·boot 분기) · `forge-app.js`(시연 훅 `_embedEmit` step/done/stopped·result) · `forge.css`(`body.embed`) · **`forge-embed.js`(신규 — 메시지 API, 마지막 로드)** · `forge.html`(script 태그).
- 앱: **`app-forge-frame.js`(신규 — 단일 iframe 관리·큐·Promise API)** · `app-screen-chart.js`(SVG → 프레임) · `app-screen-run.js`(연출 = 프레임 play, 시트 서사 = step 이벤트).
- 배포 세트: forge 8종 + forge-embed.js(동반 필수) + 앱 파일. 앱은 서버의 forge.html 을 절대 URL 로 연다(엔진과 같은 규칙).

## 검증
- `./tests/run.sh` 전량 + PC forge.html 헤드리스 무에러(회귀 0) + 앱 차트/실행 화면 E2E(프레임 ready→result→play done) + 스크린샷 대조(PC 차트 vs 앱 프레임).
- 판정 정합: 앱 엔진 브리지(app-engine) 결과와 프레임 result 의 방향·확률 비교 로그 — 어긋나면 그래프 옵션(relOpts·futW) 통일(2차).

## 이월
- 앱 작도 토글 시트 ↔ 프레임 지표별 표시(`_evVisible`) 연동(1차는 전체 on/off).
- 커스텀 프리셋/가중치 UI 를 프레임 레일로 대체할지(현 앱 mix 시트 유지).
