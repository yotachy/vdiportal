# 이동평균 심화 + 시연 상세화 프레임워크 — 설계

- 작성일: 2026-06-29
- 대상: 스쿱포지(Scoop Forge) — `forge.html` + `forge-core.js`
- 선행: [다각도 추세](2026-06-29-multi-angle-trend-design.md) · [타임프레임 인지 추세](2026-06-29-timeframe-aware-trend-design.md) (구현·배포됨)
- 상태: 설계 승인됨 (구현 계획 대기)
- 위치: **각 기술 도구 심화 로드맵의 1번**(이평) — 이후 피보·엘리어트·RSI·주기·거래량이 같은 패턴을 반복. 이 스펙이 공용 "시연 상세화" 프레임워크도 함께 구축.

## 1. 배경 / 문제

추세선은 다각도·TF인지로 깊어졌으나, 나머지 도구는 얕다. **이동평균(ma)**은 현재:
- eval: `sma(price, len)` — 단일 SMA 시계열 1개.
- 신호: 가격 vs MA 한 줄(`(priceLast-last)/last*5`).
- 작도: 단일 선 1개(차트·오버레이).
- 시연: `nodeReadText` 한 줄("MA값 · 상회/하회").

사용자 요구: 각 도구를 추세선 수준으로 심화하고, **분석 과정을 시연·작도에 상세히** 드러낸다(시연 길어져도 무방, 노드별 시간 무시).

## 2. 목표

이동평균을 전문가급 다중MA 분석으로 끌어올리고, 그 분석을 예측·작도·시연에 일관 반영한다. 동시에 **재사용 가능한 시연 상세화 프레임워크**(단계 내레이션 + 누적 로그 + 작도 레이어 단계출현)를 구축해 후속 도구가 얹을 수 있게 한다.

### 비목표 (YAGNI)
- 후속 도구(피보·엘리어트 등)의 심화는 별도 스펙. 본 스펙은 시연 프레임워크가 그들을 **수용**할 수 있게만 일반화하고, 내용은 MA만 채운다(他 도구는 기존 1줄=단일 스텝으로 폴백).
- MA 종류 확장(가중MA·Hull 등)·매매신호 자동화는 제외.

## 3. 아키텍처 (단일 출처 — 추세선 패턴 연장)

MA 분석 수학을 코어 순수 함수 `analyzeMA`로 모아 예측·작도가 공유. 시연 상세화는 `analysisSteps`(노드→단계 배열) + HUD/로그/작도 reveal로 분리.

## 4. 코어: `ForgeCore.analyzeMA(price, opts)` (신규 순수 함수)

```js
analyzeMA(price, { len=20, ema=false, srPct=0.015 }) → {
  mas: {
    short: { period:len,    series:number[], slope:number, last:number },
    mid:   { period:len*3,  series:number[], slope:number, last:number },
    long:  { period:len*6,  series:number[], slope:number, last:number },
  },
  cross:  { type:"golden"|"dead"|null, barsAgo:number|null },  // 단×장 최근 교차(없으면 type=null)
  align:  { order:"bull"|"bear"|"mixed", score:number },        // score 0..1 (정렬 충족도)
  sr:     { ma:"short"|"mid"|"long"|null, side:"support"|"resistance", distPct:number },
  bias:   number,   // -1..1 (align·cross·long slope 종합 방향)
}
```

### 4.1 MA 산출
- `short=len`, `mid=len*3`, `long=len*6` 기간.
- `ema=false`면 SMA(기존 `sma` 재사용), `true`면 EMA(`α=2/(period+1)`).
- 각 `series`는 전체 길이(앞부분은 부분평균; 기존 `sma` 동작과 동일하게). `last`=마지막 값.
- `slope`: 최근 `min(len, P-1)`봉 회귀 기울기를 가격대비 정규화(`slopeRaw/last`), `tanh`로 -1..1 캡.

### 4.2 크로스
- `short.series` vs `long.series`의 마지막 교차 탐색(최근부터 역방향, 최대 `len*6`봉). 단기가 장기를 상향 돌파=`golden`, 하향=`dead`. `barsAgo`=교차 후 경과 봉. 교차 없으면 `{type:null, barsAgo:null}`.

### 4.3 정렬(배열)
- 현재값 비교: `price_last > short.last > mid.last > long.last` → `bull`(정배열). 완전 역순 → `bear`(역배열). 그 외 `mixed`.
- `score`: 인접 4쌍(가격>단, 단>중, 중>장) 중 한 방향으로 충족된 비율(0..1). bull이면 충족 쌍/3, bear이면 역충족/3.

### 4.4 동적 지지/저항
- 현재가에 가장 가까운 MA(상대거리 `|price-last_ma|/price` 최소) 선택. 거리 `≤ srPct`면 그 MA를 동적 S/R로 보고, 가격이 그 MA 위면 `support`(받침)·아래면 `resistance`. 가까운 MA가 `srPct` 밖이면 `ma:null`.

### 4.5 종합 방향 `bias`
- `bias = clamp(-1, 1, 0.5*alignDir*score + 0.3*crossDir + 0.2*longSlope)`
  - `alignDir`: bull=+1, bear=-1, mixed=0.
  - `crossDir`: golden=+1, dead=-1, null=0 — 단, `barsAgo`가 `len*3` 초과면 감쇠(`*max(0,1-barsAgo/(len*6))`).
  - `longSlope`: `long.slope`(-1..1).

## 5. 예측 연동: `forge-core.js`

MA 블록의 방향 기여를 강화하고 TF 가중한다. **이중계상 방지를 위해 단일 경로로 통합한다.**
- **통합 지점**: `run` 안에서 그래프에 MA 블록이 있으면 `analyzeMA(price, {len, ema})`로 `bias`를 산출하고, **추세성분과 같은 방식으로**(추세선이 `trS`를 더하는 패턴) 시그널/드리프트에 가산하는 보조 항으로 반영한다(`run`이 MA 노드를 찾아 파라미터를 읽음). 기존 MA 블록 eval 값(`sma` 시계열)이 combine→signal로 흐르던 경로는 유지하되, 새 MA 방향 기여는 그 경로와 **합산되지 않도록** `run`의 보조항 한 곳에서만 적용한다. 구체 라인은 플랜에서 확정.
- **TF 가중**: `trendProfileForTF(opts.timeframe).trendScale`를 MA 국면 강조 배율로 재사용 → `maContribution = analyzeMA.bias * trendScale`(장기TF일수록 MA 국면 비중↑).
- MA 블록 파라미터 `len`/`ema`는 그래프 노드 `n.params`에서 읽어 전달(`ema` 미지정=false).
- 회귀 안전: MA 블록 없으면 기여 0(기존 동작 보존), `bias` 유한 보장.

## 6. 작도: `forge.html`

### 6.1 공용 헬퍼 `_drawMALayers(c, ma, M)` (차트·오버레이)
- 좌표 매퍼 `M`(추세선 `_drawTrendLayers`와 동일 형태: `fiToX`, `pToY`, `nowFi`, `xNow`, `xRight`, `fiMin`) + 선택 `reveal`(레이어 출현 상한, §7.4; 미지정/∞=전체).
- 레이어:
  1. **3중 MA선**: short=1.4px, mid=2.0px, long=2.6px(다크 외곽). 블루 계열 구분색(`#7fb0ff`/`#5b8def`/`#3b62c0`).
  2. **크로스 마커**: 교차 봉 위치에 골든=`#46c28e` ▲, 데드=`#e06a6a` ▼ + "골든/데드 N봉전" 소형 라벨.
  3. **배열 라벨**: 우측 상단 소형 라벨 "정배열 ▲"(초록)/"역배열 ▼"(빨강)/"혼조 –".
  4. **동적 S/R**: `sr.ma`가 있으면 해당 MA선을 굵게+점선 강조 + "지지"/"저항" 라벨.
- `analyzeMA` 시계열은 인덱스 공간 → 좌표 변환만(추세선과 동일 규약). `c.save()/restore()`로 상태 격리.

### 6.2 트렌드 분기 교체
`_drawEvidence`의 차트·오버레이 `n.blockType === "ma"` 분기를, 단일선 그리기 → `analyzeMA` 호출 + `_drawMALayers`로 교체(추세선과 동일 구조). 범례 라벨 "이동평균"→"이동평균(다중)".

### 6.3 편집기 파라미터
`forge.html` MA 편집기 행: `len`(이동평균 길이, 기존) + `ema`(EMA 사용, 체크박스형 — `boolRow` 신규 또는 `numRow` 0/1). 노드 `n.params.ema`.

## 7. 시연 상세화 프레임워크 (공용·재사용)

### 7.1 `analysisSteps(n, result, priceLast)` (신규)
노드별 분석 **단계 배열** 반환: `[{ text:string, layer?:number }]`. `layer`는 작도 레이어 reveal 단계(없으면 0).
- **MA**: 5단계 —
  1. `"단·중·장 MA 산출(${len}/${len*3}/${len*6})"` layer:1
  2. `"${order==='bull'?'정배열':order==='bear'?'역배열':'혼조'} (정렬도 ${pct})"` layer:1
  3. cross 있으면 `"${골든/데드}크로스 ${barsAgo}봉 전"` layer:2, 없으면 `"교차 신호 없음"` layer:2
  4. `"장기 기울기 ${방향}${sr.ma?` · ${side} 근접`:''}"` layer:3
  5. `"종합 방향 ${bias>0.1?'상승':bias<-0.1?'하락':'중립'} (bias ${bias.toFixed(2)})"` layer:4
- **그 외 블록**: 기존 `nodeReadText(n,...)` 한 줄을 단일 스텝 `[{text, layer:0}]`로 폴백.

### 7.2 HUD 단계 내레이션
`playAnalysis`의 노드 시연 구간(`_hudNode`)에서, 단일 read 대신 `analysisSteps`를 받아 HUD에 하위단계 리스트(`.ph-steps`)를 **순차로 점등**. 단계 간격 `STEP_SUB`(예 600ms), 노드 총 시연시간 = `단계수 * STEP_SUB`(노드별 시간 무시 요구 충족 — 단계 많을수록 길어짐).

### 7.3 누적 분석 로그 패널
HUD 하단/별도 영역에 `#analyzeLog` 추가. 각 단계 점등 시 `[${BTLABEL}] ${step.text}` 한 줄 append(자동 스크롤). 재생 시작 시 클리어. 재생 종료 후에도 잔존(읽기용).

### 7.4 작도 레이어 단계 출현
- `_drawEvidence`/`_drawMALayers`에 노드별 **reveal level** 전달: `_evReveal[nodeId] = 현재 단계 layer`. MA 작도는 `M.reveal`(또는 ma 인자에 동반)에 따라 `layer ≤ reveal`인 레이어만 그림.
- 재생 중 각 단계 점등마다 해당 노드 `_evReveal` 갱신 후 `drawEvidence()` 재호출 → 레이어 순차 출현. 비재생(평상시)·재생 종료 후엔 `reveal=∞`(전체 표시).
- 추세선 등 reveal 미지원 도구는 reveal 무시(항상 전체) — 점진적 일반화.

## 8. 테스트 (`forge-core.test.js`)

- `analyzeMA`:
  - 합성 골든크로스(하락→상승 전환 데이터) → `cross.type==="golden"`, `barsAgo`는 작은 값.
  - 정배열 상승 데이터(단조 증가) → `align.order==="bull"`, `bias>0`, `long.slope>0`.
  - 역배열 하락 데이터 → `align.order==="bear"`, `bias<0`.
  - `ema:true`와 `false`가 서로 다른 `last` 산출(둘 다 유한).
  - 소량 데이터(P<len) → 예외 없이 동작(부분평균).
- 예측: MA bias 상승 데이터에서 `timeframe:"월봉"`이 `"5분"`보다 시그널/타깃 상향(TF 가중 검증), 둘 다 유한.
- 시연(`analysisSteps`·HUD·로그·reveal)은 단위테스트 불가 → 헤드리스/라이브 시각검증(컨트롤러).

## 9. 영향 / 호환

- 데이터 모델: MA 블록 `params`에 `ema` 추가(하위호환: 미지정=false=SMA).
- `analyzeMA`·`analysisSteps`는 순수/결정적 → 테스트 용이.
- 시연 프레임워크는 일반화되어 후속 도구가 `analysisSteps`에 케이스만 추가하면 됨.
- 단일 HTML·바닐라 JS·무빌드·다크 토큰·한국어 유지. 작도·예측 정합 강화.
