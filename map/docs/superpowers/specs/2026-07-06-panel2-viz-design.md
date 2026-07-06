# 패널 2 시각화 (도넛·게이지·스파크라인) — 설계

- 날짜: 2026-07-06
- 대상: `map/forge-app.js`(렌더 함수) + `forge.css`(스타일). `forge-core.js`·데이터·서버 미변경.
- 목적: 중앙 데이터 영역의 "표 느낌"을 줄이고 도넛·반원 게이지·스파크라인 등 다양한 시각으로 수치를 표현한다. **수치 로직은 불변**(표현만 추가).

## 배경

패널 2(중앙: 판정 헤더·타임프레임 매트릭스·예측 시점별·오실레이터·지표 방향)는 텍스트/표 위주다. 이미 계산되는 수치(컨플루언스·상중하 지표수·시그널·달성확률·오실레이터 last)는 시각화에 적합하나 현재는 텍스트·가로 바로만 표시된다.

## 결정 사항 (브레인스토밍 합의)

- 4묶음 전부: 판정 도넛(컨플루언스+상중하) · 시그널 반원 게이지 · 오실레이터 미니게이지 · 예측 시점별 표 시각화.
- **인라인 SVG**로 구현(프로젝트 SVG 규약·CSS 변수로 7테마 자동 적응·선명·경량).
- 판정 시각 스트립은 **판정 텍스트 아래 별도 행**(텍스트 밀집 회피).

## 1) 재사용 SVG 헬퍼 (forge-app.js, 신규)

순수 함수 — 인자 → SVG 문자열. DOM/상태 비의존.

- `_donutSVG(segs, opts)` — `segs=[{v, color, label}]`. stroke-dasharray로 도넛. opts: size(기본 46)·thickness·centerText.
- `_gaugeSVG(val, min, max, opts)` — 반원(180°) 아크 게이지. opts: zones=[{from,to,color}](존밴드)·color(값 아크)·label. 니들 또는 채움.
- `_ringSVG(pct, color, size)` — 0~100 원형 미니게이지(작은 링 + 중앙 %).
- `_sparkSVG(vals, opts)` — polyline 스파크라인. opts: color·w·h·fill(area).

색은 `--bull`#46c28e·`--bear`#e06a6a·`--gold`·`--eth`·`--muted`·`--faint`를 `getComputedStyle`로 읽거나 `currentColor`/CSS var 직접 사용 → 테마 적응. bull/bear는 상수.

## 2) 판정 헤더 시각 스트립 (renderVerdict → fcVerdictBar)

`renderVerdict`(forge-app.js ~1251)가 채우는 `#fcVerdictBar` 내부에, 기존 텍스트 판정(`fcv-reg`/`fcv-sig`/`fcv-op`) **아래 별도 행**(`.fcv-viz`)을 추가:

- **컨플루언스 도넛**(`_donutSVG`): 합의(`verdict.confluence.agree`, 색=국면 방향) vs 나머지(`total-agree`, `--faint`). 중앙 텍스트 `87%`. 라벨 "컨플루언스 20/23".
- **상중하 도넛**(`_donutSVG`): 상승/중립/하락 지표수(`verdict.confluence` 또는 지표 집계에서) 3색(bull/eth/bear). 중앙에 우세 방향 아이콘. 라벨 "21·5·4".
- **시그널 반원 게이지**(`_gaugeSVG`): `verdict.score`(−100~+100), 0 중앙, 색=방향(bull/bear/eth). 라벨 "시그널 +95".

값 출처는 기존 `verdict` 객체(추가 계산 없음). 상중하 지표수는 이미 헤더 스택바가 쓰는 집계 재사용.

## 3) 예측 시점별 표 시각화 (renderHorizons ~108)

HTML `<table>` 유지(정보 밀도), 표현만 교체:
- **달성확률** 셀: 가로 바(`.dbar`) → `_ringSVG(up, probCol)` 원형 미니게이지 + % 텍스트.
- 패널 상단(표 위)에 **변화% 스파크라인**(`_sparkSVG`): 각 시점 `chg` 경로 — 예측 방향을 한눈에.

시점·예측가·범위 텍스트는 유지.

## 4) 오실레이터 미니게이지 (fcDrawRsi/Cci/Williams/Mfi meta)

각 서브패널의 meta(`fcRsiMeta` 등) 업데이트 시, 텍스트 옆에 `_gaugeSVG(last, min, max, {zones})`:
- RSI/MFI: 0~100, zones 과매도(0~30/20)=bull대·과열(70/80~100)=bear대.
- Williams: −100~0, zones 과매도(−100~−80)=bull·과매수(−20~0)=bear.
- CCI: −200~200(클램프), zones ±100.
캔버스 그래프는 유지 — 게이지는 last값 즉시 판독 보조.

## 5) 색·레이아웃·규칙

- 토큰만 사용(bull/bear/gold/eth/muted/faint). **좌측 accent line 금지**. 라운드 토큰.
- 반응형: 좁을 때 도넛/게이지 축소·줄바꿈(`.fcv-viz{flex-wrap}`). 모바일 유지.
- 시연(playAnalysis) 정합: 판정/표는 기존 reveal(`fillU`) 흐름 유지 — 도넛/게이지도 최종값으로 그림(중간 충전은 선택, 과설계 지양 → 최종값 1회).

## 검증

- **수치 불변**: 예측 target·확률·시그널·컨플루언스 값 동일(로직 미변경). SIG 기능지표(target/dir/pathLen/nodes/ell/themes) 불변, `staticEls`는 새 SVG로 증가(의도).
- 7테마 순회: 도넛/게이지 색이 테마 따라 적응(bull/bear 상수·나머지 토큰) + 판독 가능.
- 시각 스크린샷(판정 스트립·예측표·오실레이터 게이지) + 에러 0 + 코어 199/199.

## 제약 / 비목표

- 단일 산출물군·번들러 없음(분리 구조 유지). 외부 차트 라이브러리 금지(직접 SVG).
- 비목표: 타임프레임 매트릭스 히트맵(후속 여지), 애니메이션 도넛 충전, 지표 방향 레이더 교체(이미 시각적).
- 배포 세트 7파일 동반(forge-app.js·forge.css 변경) · 데이터 불가침.
