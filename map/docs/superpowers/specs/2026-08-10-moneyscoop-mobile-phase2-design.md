# 머니스쿱 모바일 Phase 2 — PC 예측선 작도 포팅 (꿈틀 · 끝점 장식 · 구간 신뢰도)

- 날짜: 2026-08-10
- 대상: `map/mobile/www/draw-preds.js`(신규) · `chart-draw.js`(배선) · `map/mobile/test/`
- 선행: [`2026-08-10-moneyscoop-mobile-phase1-design.md`](2026-08-10-moneyscoop-mobile-phase1-design.md)
- 상태: 설계 승인됨 (2026-08-10)

## 1. 배경 — 왜 이 작업인가

Phase 1을 폴드7에서 확인한 사용자 판단: **차트는 나오지만 PC 품질보다 떨어진다.** 백로그에 미포팅 4종(진앙 마커·구간 신뢰도·데이터 질감·범례 토글)을 적어 두었고, 그중 성격이 다른 하나(범례 토글)를 떼어낸 것이 이 Phase다.

### 조사에서 예상이 뒤집힌 것

"데이터 질감"이 엔진 산출물일 것이라 적어 두었으나 **틀렸다.** `seasFn`·`_volFac`은 `forge-draw.js`에 없고, 엔진은 질감을 경로에 미리 반영해 보내지 않는다. 엔진은 `prediction.tex`(길이 `futW+1`)와 `prediction.levels`를 **원자재로 넘기고**, 작도 쪽 `_predWigSeqSR(n, vals, lo, hi, levels, tex, sd)`가 그것으로 **꿈틀(wiggle)을 계산**한다(`forge-draw.js:1168`).

즉 지금 모바일 예측선이 매끈한 직선으로 보이는 것은 스타일 문제가 아니라 **그 계산을 하지 않아서**다. PC 차트가 "살아 있다"는 인상의 출처가 여기다. 모바일은 이미 `tex`·`levels`를 매 실행마다 받고 있으면서 버리고 있었다.

## 2. 범위

**넣는다 — A군, 순수 작도**

> ⚠️ **초안의 "85줄 / 4함수"는 틀렸다(2026-08-10 폐포 실측으로 정정).** 호출부를 읽으니 꿈틀은 단독 함수가 아니라 파이프라인이었다 — 수열을 만드는 `_predWigSeqSR`, 그 수열을 밴드 안의 실제 y로 바꾸는 `_predWigVal`, 구간 신뢰도 수열 `_predConfSeq`, 그리고 가로 알파 페이드로 실제 스트로크를 수행하는 `_strokePredLine` 이 함께 있어야 한 줄이 그려진다.

**전이 폐포 21심볼 / 185줄.** 그중 약 34줄은 **Phase 1 `draw-layers.js`에 이미 포팅돼 있어 다시 복사하지 않는다**(아래 §3.1). 순증 포팅은 약 151줄.

| PC 심볼 | 줄 | 하는 일 |
|---|---:|---|
| `_predWigSeqSR` | 26 | 꿈틀 수열 — S/R 레벨 반응 + AR 결. `[-1,1]` 정규화된 길이 `n` 수열을 돌려준다(y값이 아니다) |
| `_predWigVal` | 5 | 수열 한 점을 밴드(`lo`/`hi`)와 신뢰도로 실제 값에 적용 |
| `_predConfSeq` | 6 | 구간 신뢰도 수열 `{conf[], kEnd}` |
| `_predConfAt` | 8 | 한 구간의 신뢰도 |
| `_predBandW` | 5 | 로그 공간 밴드 폭 |
| `_predHorizonK` · `_CONF_HORIZON` | 11 | 신뢰도 지평 |
| `_strokePredLine` | 20 | 가로 알파 페이드 스트로크 — 실제로 선을 긋는 곳 |
| `_predPCal` | 5 | 끝점 캘리브레이션 방향확률(라벨 문구용) |
| `_predEndDeco` | 42 | 끝점 장식 |
| `_epicenterMark` | 9 | 끝점 동심원 파문 |
| `_mulberry32` · `_SR_W` · `_AR_W` | 3 | 결정론 PRNG · 조정 상수 |

### 3.1 라벨 레지스트리는 공유해야 한다 — 복사하면 깨진다

폐포에 `_evLabel` · `_evLabelBoxes` · `_axisLabelBoxes` · `_predLabelBoxes` · `_fitBoxY` · `_labelMode` · `_KEYLBL` · `_evW` 가 들어 있는데, **이것들은 Phase 1 `draw-layers.js` 안에 모듈 사설 상태로 이미 존재한다.**

`draw-preds.js`에 다시 복사하면 **레지스트리가 두 벌이 된다.** 그러면 `_predEndDeco`가 등록하는 끝점 라벨은 `draw-layers`가 등록해 둔 축 눈금·현재가 태그·지표 배지를 보지 못하고, 서로 겹친 채 그려진다. 충돌 회피의 전제가 "모든 라벨이 같은 박스 목록을 본다"는 것이기 때문이다.

**따라서 `MSLayers`가 `_evLabel`과 등록 상태를 노출하고 `MSPreds`가 그것을 쓴다.** `draw-layers.js`의 export에 `evLabel`(그리고 필요한 최소 접근자)을 추가하는 것이 이 Phase의 유일한 Phase 1 파일 수정이다.

**넣지 않는다 — 버리는 것이 아니라 순서를 뒤로 둔다**

- **B군**: 범례 클릭 토글 → 표시 지표 집합(`_evVisible`) → 2차 예측(`_get2ndPred`). 새 상태 + 토글마다 엔진 2회차 실행 + 캐시가 필요하고, 2차 선은 **custom 티어 전용인데 custom 화면 자체가 v4**다. 지갑도 custom 화면도 없는 시점에 엔진 재실행·캐시 인프라를 먼저 짓는 셈이 된다.
- 핀치줌 · 로그축: 제스처를 다시 건드리므로 Phase 1이 구조적으로 해결한 스크롤 충돌(350ms 홀드 계약)을 재설계해야 한다. 독립 Phase로 다룬다.

화면·상태·인터랙션은 변경하지 않는다. 이 Phase는 이미 그려지는 선이 **어떻게** 그려지는지만 바꾼다.

## 3. 배치

Phase 1의 포팅 두 모듈과 같은 규약을 따른다 — **원문 복사, `forge-draw.js` 무수정, 심은 최소**. 작도는 엔진과 달리 단일 원본이 아니다(표현이지 분석이 아니며 폼팩터가 다르다); 숫자는 여전히 `forge-core.js` 단일 원본이다.

```
mobile/www/
  draw-preds.js     신규 — 꿈틀 · 끝점 장식 · 진앙 마커 · 구간 신뢰도
  chart-draw.js     수정 — drawCone 이 예측선을 그릴 때 위를 경유
```

`draw-preds.js`를 새 파일로 두는 이유는 둘이다. `draw-layers.js`는 **가격 패널 지표 오버레이**가 책임이라 예측선 장식과 성격이 다르고, `chart-draw.js`에 넣으면 그 파일이 다시 네 가지 일(캔들·콘·축·크로스헤어)에 더해 다섯째를 지게 된다.

## 4. 인터페이스

```js
MSPreds = {
  wiggle(n, vals, lo, hi, levels, tex, sd) -> number[]   // 꿈틀 적용된 y값 수열
  confAt(k, n)                             -> number     // 구간 k 의 신뢰도(밴드 폭 계수)
  epicenter(c, x, y, r, col)               -> void       // 동심원 파문
  endDeco(c, opts)                         -> void       // 끝점 장식(진앙 + 라벨)
}
```

`drawCone`은 `p1`/`p3` 폴리라인을 **그리기 전에** `wiggle`로 좌표를 변형하고, 마지막 점에서 `endDeco`를 부른다. **티어 사다리는 그대로** — 꿈틀과 장식은 그 티어가 실제로 그리는 선에만 적용된다(basic이면 1차 하나).

`endDeco`가 쓰는 `_evLabel`과 라벨 충돌 레지스트리는 `draw-layers.js`에 이미 포팅돼 있다. **`MSLayers.resetLabels()`가 매 프레임 먼저 돌아야** 끝점 라벨이 축 눈금·현재가 태그와 충돌 회피에 참여한다 — Phase 1의 합성 순서에 이미 그 호출이 있으므로, `endDeco`는 그 이후에 불려야 한다.

## 5. 시드 — 프레임마다 흔들리면 안 된다

`_mulberry32`는 결정론적 난수다. 같은 시드면 같은 꿈틀이 나온다. 크로스헤어 이동·리사이즈로 매 프레임 다시 그리는데 시드가 흔들리면 선이 살아 있는 게 아니라 **지직거린다**.

시드는 **심볼 + 주기**로 고정한다(같은 종목·같은 주기면 항상 같은 꿈틀). 새 분석 결과가 오면 자연히 `vals`가 바뀌므로 꿈틀도 따라 바뀐다 — 시드를 바꿀 필요가 없다.

## 6. 테스트

`wiggle`과 `confAt`은 순수 함수라 **값으로** 검증한다. 나머지는 Phase 1과 같은 recording-ctx 페인트 단언.

| 대상 | 무엇을 고정하나 |
|---|---|
| `wiggle` | 같은 시드·입력이면 같은 수열(결정론) · 다른 시드면 다른 수열 · `tex`가 없으면 원본 `vals`를 그대로 돌려주는 매끈한 폴백 · `levels` 근처에서 반응이 커짐 · 길이 보존 · NaN 없음 |
| `confAt` | 0..n 범위에서 유한하고 단조(먼 구간일수록 신뢰도 낮음) |
| `epicenter` | 동심원이 실제로 `arc`로 그려짐(반환값이 아니라 페인트 단언) |
| `endDeco` | 진앙과 라벨이 모두 페인트됨 · `resetLabels` 없이 불러도 던지지 않음 |
| `drawCone` 통합 | basic 티어에서 꿈틀이 적용된 폴리라인 하나 + 끝점 장식 · 티어별 선 수는 Phase 1 계약 유지 |

전체 관문은 `map/tests/run.sh`.

## 7. 열린 항목

- **B군**(범례 토글 → 2차 예측) — custom 티어 화면(v4)과 함께
- **핀치줌 · 로그축** — 스크롤 충돌 계약 재설계 필요, 독립 Phase
- **`_predDir` PC 전역 의존** — `M.focused`를 켜기 전에 반드시 해결. 이 Phase는 `focused`를 건드리지 않으므로 여전히 도달 불가
- **Capacitor 툴체인 검증** — 여전히 미검증. Phase 1·2 확인은 모두 폰 Chrome이지 WebView가 아니다
- 잠긴 범례 스와치 색 명시화 · `?since=` 증분 시세 · 봉 수 ↔ 정확도 실측
