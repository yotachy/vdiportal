# 머니스쿱 앱 P2 — 분석 코어 (3단계 전체 + PC 품질 작도)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development 또는 executing-plans. 본 세션 인라인 실행.

**Goal:** 기본/심화/커스텀 3단계 전체가 시안 동선대로 돌고, 차트·작도가 PC 웹버전과 동일 품질(사용자 확정 하한)에 도달한다.

**Spec:** BUILD-PLAN §5·§7-P2 + dissection/02(시트·차트·run 마크업) + dissection/03 §1~2(실행·PiP 로직 전문) + **차트 품질 하한**(BUILD-PLAN §5, 2026-08-24) + Q4·Q5 확정.

## Global Constraints (P0·P1 승계 + 추가)

- 작도·차트는 **forge-draw.js 의미와 동일**하게 이식 — 모바일용 단순화 금지. 페르소나 은행 총량 숫자 금지.
- 차감·환불은 P2 에선 클라 POLICY 기준(서버 트랜잭션 전환은 P5) — 흐름·타이밍은 시안 그대로.
- 스킵 없음 · 동시 1건 · 대상 동결 · 중단 전액 반환 · 차감은 최종 확인 1회.

## 태스크

### T1: 엔진 브리지 32종 (Q5 매핑표 확정)
- `IND_META` 32종 전체(엔진 blockType 정본, 한국어명, 그룹 t8·m7·v6·q5·s6):
  t: ma·trend·adx·ichimoku·supertrend·psar·aroon·gann / m: macd·rsi·stochastic·cci·williams·roc·ao /
  v: bollinger·atr·keltner·donchian·cycle·phasefold / q: volume·vwap·volumeprofile·mfi·cmf /
  s: fib·pivot·structure·smc·elliott·pattern
- `computeInd` 32종 — 각 analyze* 실측값 해설문. onStep 32회 + custom 특별 스텝(가중치 33·페르소나 34)은 run 화면 몫.
- **프리셋→driftWeights**: PROF 5축값/6 을 그룹 소속 지표의 배율로(전체 종합=×1, clamp 0~3).
- **커스텀**: 지표별 배율(0~3, mix 슬라이더) → driftWeights 직접. personaApply 는 전달만(P6 실보정).
- **1/2/3차 예측선**: p1·p2(counter)=기준 실행, custom 은 가중 실행 별도 → p3 실좌표(R-B06). deep 은 p1·p2.
- 테스트: 32종 스텝·그룹 카운트(8/7/6/5/6)·프리셋 가중 매핑·가중 0~3 클램프·custom 이중 실행 결정성.

### T2: 시트 4종 — tier·preset·deduct·short (마크업 L1720~1847)
- tier: 3카드(잔고 캡슐·capacityLine·부족 힌트) → pickBasic/Deep/Custom(guardRun 선행).
- preset: 추천 3장(내 성향=무답 잠금 카드) + 9종 접이 그리드(5색 배분 바) + 하단 고정 CTA(비용 표기).
- deduct: 1050ms 무버튼 자동 진행 오버레이(취소선 연출·hap deduct·차감·startRun).
- short: 부족 시트(광고/출석 자리는 P5 — 기본 분석 대안 CTA 동작).
- 24h 무차감 규칙(Q3 대칭): deep·custom 공통 live 판정.

### T3: mix(비중 조절)·pfit(페르소나 확인) 화면 (L729~807)
- mix: 미니 차트(엔진 재계산 미리보기 — 프로토 픽셀 오프셋 대신 실좌표) + 7행 슬라이더(0~3·0.5스텝·체크·부호) + "나머지 25개 ×1" + CTA. 가중치·체크 영속(Q8).
- pfit: 히트맵 재사용(P6 전 빈 상태 pfitEmpty) + 골드/아웃라인 CTA → runCustom.
- 슬라이더 7지표: 시안 wts 7종을 엔진 id 로 매핑(이동평균 ma·슈퍼트렌드 supertrend·MACD macd·볼린저 bollinger·거래량 volume — 다이버전스 2종은 rsi·volume 가중으로 흡수, Q5 각주).

### T4: 실행 연출 전체 (03 §1 전문 승계)
- 32칸 틱바(그룹색)+custom 33·34 특별칸 · 진행률 구간식(94/96/98/100) · 로그 슬라이딩.
- 그룹 작도 시퀀스(prog%6 순환 — PC 작도 레이어로) · 카메라 워크 3단 · 원뿔 페이드인(basic 4/그 외 29).
- 특별 구간: deep 30→31(2600ms)·custom 32→33(pApply 3300ms) · 엔진 영상(engine-deep/apply.mp4, onended→endApply, 30s 타임아웃, bgWatch 3200ms).
- 중단(전액 반환·runFrom 복귀)·runFail·runRetry · guardRun(전 진입점 4곳+강제 복귀) · **PiP 카드 2종**(진행/완료·pipBack 컨텍스트 복귀).

### T5: 결과 4세그 완성
- 근거: 31행(강도순) · 시점별 hz: 4행(+10/20/40/60일 — 엔진 path·hi·upProb 실값+범위 바) · 지표: 다이버징 18행 · 해설 narr: 결론 문단(실값 조립)+반대 의견(반대 방향 상위 지표 실목록)+지표 해설 아코디언.
- 판정 블록 deep 확장(agree/agreePct·국면 칩·기회 칩) · 채점 예고(gradeNote — 심화·커스텀).

### T6: 차트 PC 품질 — 작도 32종 + 조작 (품질 하한 합격선)
- forge-draw.js 를 지표별로 읽어 **의미 동일 이식**: 오버레이(ma·bollinger·ichimoku 구름·keltner/donchian per-bar 밴드·supertrend·psar 점·vwap·pivot 정적 S/R·gann 부채꼴·fib 되돌림·trend 회귀채널·structure 스윙·smc 존·volumeprofile 프로파일·elliott 라벨 등) + 오실레이터형은 hero 배지(PC 규약 — cci·williams·mfi 서브패널은 2번 패널 소관이라 모바일 결과 탭에서 표현).
- 작도 토글 시트(draws — "작도 N/32" 칩·2열 그리드·모두 켜기/끄기·indOff 영속·코치마크 1회).
- **핀치 줌 + 드래그 팬**(버튼 없음 — 웹과 동일 감각). 2/3차 예측선 레이어(청록/골드·박자 다른 점멸)+범례.
- 검증: PC forge.html 과 같은 종목·같은 지표로 나란히 스크린샷 대조.

### T7: 종합 검증·배포
- run.sh 전량 + 여정 E2E(기본→심화→커스텀 전 동선·중단·PiP·guardRun) + PC 대조 스크린샷.
- cafe24 배포(www/map/app/ + engine-*.mp4 에셋) · BUILD-PLAN·플랜 완료 표기.

## 리스크
- T6 이 최대 — forge-draw 이식 범위가 크므로 T1~T5 완주 후 지표군별로 나눠 커밋.
- 영상 에셋 22MB 업로드(1회). 리포트 영속화(P1 이월)는 T5 에서 state 확장으로 해소.
