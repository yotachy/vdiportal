# 판정바 밀도·정렬 + 모바일 반응형 다듬기 설계

- 날짜: 2026-07-17 · 상태: 승인됨 · 성격: UI 다듬기(CSS/마크업 전용·엔진/분석 로직 불변)
- 배경: UI 개선 패스 ①판정바 ④모바일 중심(②예측시점별=샘플 착시로 무손질·③헤더=선택적 제외). [[scoopforge-design-precision]] 정밀계기 톤 준수.
- 범위: `forge-app.js`(판정바 마크업 미세), `forge.css`(정렬·모바일). **로직·데이터·엔진 불변**(같은 값·같은 계산, 표현만).

## 1. 원칙 (불가침)
- 디자인 토큰만(`--ink/eth/faint/line/bull/bear/gold` 등), 하드코딩 색 금지.
- **좌측 컬러 accent bar 절대 금지**([[no-left-accent-line]]). 활성/구분은 배경·텍스트·헤어라인(세로 border)만.
- 분석 수치·계산·엔진 무변경 → `node --test forge-core.test.js` 246/246 무관하게 유지.
- 정밀계기 톤: tabular-nums·헤어라인 지면·절제된 골드.

## 2. ① 판정바 밀도·정렬 (데스크톱·base)
현행: `.fcv-head`(종목·방향·현재가·목표·게이지 + 국면/의견) + `.fcv-analysis`(검증된예측 `.fcv-grid` 6칩 + 지표합의 `.fcv-stats`). 이미 헤어라인·칩 스트립으로 정제됨 → **정제 위주, 과편집 금지.**

- **지표합의 `방향 ▲bl ne ▼be` 판독성**(`forge-app.js:1473` dirStat): 중립 수가 라벨 없이 떠 뭉침. → 중립에 미세 구분/라벨(`▲bl <span class=fcv-nsep>·</span> ne중 <span>·</span> ▼be` 형태, faint 컬러 구분점)로 상승·중립·하락을 눈에 분리. 값·색은 동일.
- **`.fcv-stats` 간 구분**(`forge.css:512`): 컨플루언스·방향·시그널 사이 `gap:2px 16px` 균일 → 얇은 세로 헤어라인(`.fcv-stat + .fcv-stat` before, `var(--line)`)로 스캔 단위 분리(그리드 셀과 동일 언어).
- **`.fcv-grid` vs `.fcv-stats` 베이스라인 정렬**: 두 블록(`.fcv-forecast`·`.fcv-consensus`)이 한 `.fcv-analysis`에 flex-wrap로 흐름 → 세로 정렬·`gap` 일관화(라벨 `fcv-k` 9px eyebrow와 값 baseline 정합).
- 마크업 변경은 dirStat 1곳 + CSS. 다른 값/툴팁 불변.

## 3. ④ 모바일 반응형 (@media ≤860px·필요시 ≤520px)
- **판정바 칩 뭉침**: `.fcv-grid`(검증된 예측 6칩)·`.fcv-stats`가 390px서 가로 wrap로 빽빽·헤어라인 애매. → 모바일서 `.fcv-grid`를 **2열 그리드**(`grid-template-columns:1fr 1fr`)로, 셀 우측 헤어라인은 열 경계만 유지(마지막 열·행 border 제거). `.fcv-stats`도 2열 또는 정돈된 wrap. 각 칩 라벨(`fcv-k`)+값 한 줄 유지.
- **차트 헤더 라벨 잘림**: `가격 차트 · 주기 =128봉`(`forge.html:70` `.fc-t` + TF seg)이 모바일서 truncate. → `.fc-t`/헤더 컨테이너 `min-width:0`·`flex-wrap` 허용하거나 주기 표기 축약(모바일서 `주기` 텍스트 숨김·값만), 잘림 해소.
- 데스크톱 레이아웃 무영향(변경은 @media 안에서만).

## 4. 검증
- **헤드리스 before/after 스크린샷**(캐시된 chromium + `~/.local/pwlibs`): 데스크톱 1680 판정바 클로즈업 + 모바일 390 판정바·차트헤더. 목서버로 분석 상태 재현.
- `node --test forge-core.test.js` 246/246 유지(CSS/markup only라 무관 확인).
- 회귀: 데스크톱 판정바가 과밀/붕괴 없이 정렬 개선됐는지, 모바일 칩이 2열로 읽히는지, 라벨 잘림 사라졌는지 스크린샷 대조.

## 5. 격리 / 산출
- 변경 파일: `forge-app.js`(dirStat 마크업 1곳) + `forge.css`(base 정렬 + @media 모바일). `forge.html`은 필요시 `.fc-t` min-width만.
- 캐시버스터 bump: 바뀐 파일의 `?v=`(forge-app.js·forge.css·forge.html 해당분).
- 커밋+배포 한 세트([[commit-deploy-as-one-set]]). 스코어카드 개선이력에 "판정바·모바일 다듬기" 1줄.

## 6. 리스크
- 과편집으로 정보 밀도/정밀계기 톤 훼손 → **최소 변경·before/after 대조로 방지**. 값·계산은 절대 불변.
- 모바일 2열이 특정 폭서 어색 → ≤520px 추가 분기로 보정.
