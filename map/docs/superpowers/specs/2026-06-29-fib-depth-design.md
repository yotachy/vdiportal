# 피보나치 심화 (Fibonacci Depth) — 설계

- 작성일: 2026-06-29
- 대상: 스쿱포지(Scoop Forge) — `forge.html` + `forge-core.js`
- 선행: 추세선·MA 심화([MA](2026-06-29-ma-depth-and-demo-design.md)) + 시연 상세화 프레임워크(Plan B) 구현·배포됨.
- 상태: 설계 승인됨 (구현 계획 대기)
- 위치: 도구 심화 로드맵의 **2번(피보나치)**. 추세선·MA가 만든 패턴(단일출처·TF가중·다레이어 작도·시연 단계)을 재사용.

## 1. 배경 / 문제

현재 피보(`fib`)는 얕다:
- eval: `fibPos(price, len)` — 창 최고/최저 대비 위치(-1..1) 1개.
- 작도: 창 hi/lo 기준 되돌림 레벨 7개(0/.236/.382/.5/.618/.786/1). 오버레이는 로그축 기하 피보.
- 신호: `cl(last)`(범위 내 위치).
- 시연: `nodeReadText` "범위 N%" 한 줄.

문제: **스윙을 자동 식별하지 않고**(창 hi/lo만), **확장 레벨·골든포켓·현재구간·합류가 없으며**, 예측 반영이 단순 위치값이고, 시연이 한 줄이다.

## 2. 목표

전문가급 피보 분석으로 심화하고 예측·작도·시연에 일관 반영한다. 시연 상세화는 **Plan B에서 만든 프레임워크**(`analysisSteps`/HUD 단계/누적 로그/레이어 reveal)에 피보 케이스만 추가해 재사용한다.

### 비목표 (YAGNI)
- 피보 팬·타임존·아크 등 비(非)수평 피보 도구.
- 피보+MA 교차 합류(이번엔 **피보 스윙 간 합류만** — 사용자 결정). 추후 별도.
- TF에 따른 스윙 창/민감도 자동조정(스윙은 파라미터 고정; TF는 예측 가중에만).

## 3. 아키텍처 (단일 출처 — 추세선·MA 패턴 연장)

피보 분석 수학을 코어 순수 함수 `analyzeFib`로 모아 예측(`run`)·작도(`_drawFibLayers`)가 공유. 시연 텍스트는 코어 `fibSteps`(테스트 가능)로 분리, forge.html `analysisSteps`의 fib 케이스가 호출.

## 4. 코어: `ForgeCore.analyzeFib(price, opts)` (신규 순수 함수)

```js
analyzeFib(price, { len=120, swing=0.05, srPct=0.01 }) → {
  dir:   "up" | "down" | null,                          // 1차 스윙 방향
  swing: { fromIdx, toIdx, fromPrice, toPrice } | null, // 1차 스윙(되돌림 기준)
  levels: [{ ratio:number, price:number, kind:"retr"|"ext", golden:boolean, confluent:boolean }],
  zone:  { nearest:{ ratio, price, side:"support"|"resistance" }|null, inGolden:boolean, lower:number|null, upper:number|null },
  bias:  number,   // -1..1
}
```

### 4.1 스윙 자동 식별 (방향 인지)
- `detectSwings(price, swing)` 피벗 사용. **1차 스윙** = 마지막 두 피벗(`from`=직전, `to`=최근). `to.price > from.price` → `dir="up"`(저→고), `to.price < from.price` → `dir="down"`(고→저). 피벗 2개 미만이면 창 hi/lo 폴백(`dir=null` 가능).
- 되돌림 기준: up이면 `lo=from.price, hi=to.price`; down이면 `hi=from.price, lo=to.price`.

### 4.2 레벨 (되돌림 + 확장)
- 되돌림 ratios `[0, .236, .382, .5, .618, .786, 1]`. up: `price(r) = hi - (hi-lo)*r` (0=고점, 1=저점=되돌림 100%). down: `price(r) = lo + (hi-lo)*r`.
- 확장 ratios `[1.272, 1.414, 1.618, 2.0, 2.618]` — 스윙 방향 연장(목표가). up: `hi + (hi-lo)*(r-1)`; down: `lo - (hi-lo)*(r-1)`.
- `kind`: 되돌림="retr", 확장="ext". `golden`: ratio가 `0.618 ≤ r ≤ 0.65` 범위(되돌림 0.618 레벨에 표시).
- 오버레이 로그축에서는 기하 보간(현 fib 오버레이 방식 유지) — 작도 단계에서 처리, 코어는 선형 가격 반환(작도가 좌표 변환).

### 4.3 합류 (피보 스윙 간)
- **2차 스윙** = 전체 `len` 창의 hi/lo(1차보다 넓은 구간)에서 동일 ratio 세트 산출. (1차=최근 피벗 스윙, 2차=장기 창 hi/lo → 두 시야의 레벨 비교)
- 1차 레벨과 2차 레벨 가격이 `|p1-p2|/p1 ≤ srPct` 근접하면 해당 1차 레벨 `confluent=true`.

### 4.4 현재 구간 + bias
- `zone.nearest`: 현재가에 가장 가까운 레벨(상대거리 최소). 가격이 그 레벨 위면 `support`(받침)·아래면 `resistance`(저항). `lower`/`upper`: 현재가를 감싸는 인접 레벨 ratio.
- `inGolden`: 현재가가 골든포켓(0.618~0.65 되돌림 가격대) 안.
- `bias = clamp(-1, 1, srDir*proximity + goldenBoost)`:
  - `srDir`: nearest.side=support → +1, resistance → −1. (지지 근접=상승 여지, 저항 근접=하락 압박)
  - `proximity`: `max(0, 1 - dist/srPct)` (가까울수록 강함, srPct 밖이면 0).
  - `goldenBoost`: up 스윙이고 `inGolden`이면 +0.25, down 스윙이고 inGolden이면 −0.25 (골든포켓 반등/반락 가중). clamp로 ±1 유지.

## 5. 예측 연동: `forge-core.js` `run`

MA·트렌드와 동일 단일경로 보조항:
- `run`에서 피보 블록이 있으면 `analyzeFib(price, {len, swing})`로 `bias` 산출.
- `fibDrift = bias * trendProfileForTF(opts.timeframe).trendScale * 0.08` (±8% 상한·TF가중; MA 0.10보다 약간 보수적 — 피보 S/R는 모멘텀보다 약한 신호).
- 예측 루프 `m`에 `+ fibDrift * (k/futW)` 가산. 다른 항 불변. 피보 블록 없으면 0. `bias` 유한 보장.

## 6. 작도: `forge.html` `_drawFibLayers(c, fib, M)` (차트·오버레이 공용, reveal 인지)

- `M = { fiToX, pToY, nowFi, fiMin, reveal }` — MA `_drawMALayers`와 동일 규약. `c.save()/restore()`.
- 레이어(reveal 게이트):
  1. **되돌림 레벨선**(reveal≥1): 7개 수평선 + ratio·가격 라벨. 합류 레벨은 굵게+별표(✦). 스윙 시·종점 마커.
  2. **확장 레벨선**(reveal≥2): 5개 수평선(점선·목표가 라벨), 스윙 방향 쪽.
  3. **골든포켓 밴드 + 현재구간 라벨**(reveal≥3): 0.618~0.65 밴드 옅은 채움 + "골든포켓" / "지지·저항 근접" 라벨.
- 색: 골드 계열(`#ffd24d`/`#e8b463`), 골든포켓 강조 `rgba(232,180,99,.16)`, 합류 강조. 다크 외곽 대비.
- 오버레이는 기존 로그축 기하 피보 매핑 유지(레벨 가격 → `yOf`). 차트는 선형.
- `_drawEvidence` 차트·오버레이 fib 분기 두 곳을 단일선→`analyzeFib`+`_drawFibLayers`로 교체, `reveal: _playing ? (_evReveal[n.id]||0) : Infinity` 전달. 범례 "피보나치"→"피보나치(전문)".

## 7. 시연 (Plan B 프레임워크 재사용)

- 코어 `fibSteps(fib) → string[5]` (테스트 가능): 스윙 식별 / 되돌림 레벨 요약 / 확장(목표가) / 골든포켓·현재구간 / 종합 방향(bias).
- forge.html `analysisSteps`의 **fib 케이스** 추가: `n.blockType==="fib"`면 `ForgeCore.analyzeFib(price,{len,swing})` → `fibSteps` 텍스트, layers `[1,1,2,3,4]`. (그 외 폴백 유지)
- HUD 단계 점등·누적 로그·레이어 reveal은 Plan B 프레임워크가 자동 적용(추가 배선 불요 — `_drawFibLayers` reveal만 지원하면 됨).

## 8. 테스트 (`forge-core.test.js`)

- `analyzeFib`:
  - 상승 스윙(저→고) 합성 → `dir:"up"`, `swing.toPrice>fromPrice`, 0.618 되돌림 가격 = `hi-(hi-lo)*0.618` 근사, 확장 1.618 레벨 존재.
  - 하락 스윙 → `dir:"down"`, bias 부호 타당.
  - 골든포켓: 현재가를 0.618~0.65 구간에 두면 `zone.inGolden:true`.
  - 합류: 두 스윙 레벨이 근접하도록 구성 → 어떤 레벨 `confluent:true`.
  - 소량/피벗부족 → 폴백(예외 없음, 유한 bias).
- `fibSteps`: 5단계 텍스트, 스윙 방향·골든포켓·bias 반영.
- 예측: 피보 블록 + 지지 근접 데이터에서 `timeframe:"월봉"`이 `"5분"`보다 상향(TF 가중), 둘 다 유한; 피보 블록 없으면 기존 동작.

## 9. 영향 / 호환

- 피보 블록 `params`에 `swing` 추가(하위호환: 미지정=0.05). `len` 유지.
- `analyzeFib`·`fibSteps` 순수/결정적 → 테스트 용이. export 추가.
- 시연 프레임워크(Plan B) 재사용 — 피보는 `analysisSteps` 케이스 + `_drawFibLayers` reveal만 추가.
- 단일 HTML·바닐라 JS·무빌드·다크 토큰·한국어·작도/예측 정합 유지.
