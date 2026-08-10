// PC 스쿱포지 forge-draw.js 에서 포팅 — 예측선 꿈틀 · 구간 신뢰도 · 페이드 스트로크 · 끝점 장식.
// 모바일 예측선이 매끈한 직선이었던 건 스타일이 아니라 이 계산을 안 해서였다.
// 엔진은 prediction.tex(AR 질감)·prediction.levels(S/R)를 원자재로 넘기고, 꿈틀은 여기서 만든다.
// 라벨 충돌 레지스트리는 draw-layers.js 한 벌을 공유한다 — 복사하면 두 벌이 되어
// 끝점 라벨이 지표 배지를 못 보고 겹쳐 그린다(설계 §3.1).
// 원본 심볼: _CONF_HORIZON _predBandW _predConfAt _predHorizonK _predPCal _mulberry32
//           _SR_W _AR_W _predWigSeqSR _predWigVal _predConfSeq _strokePredLine
//           _epicenterMark _predEndDeco
//           (+ forge-app.js: _hzFmt _normCdf _upProb _hzList · forge-draw.js:3363 _tfUnit)
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports)
    module.exports = factory(require("./draw-layers.js"), require("../../forge-core.js"));
  else root.MSPreds = factory(root.MSLayers, root.ForgeCore);
})(typeof self !== "undefined" ? self : this, function (Layers, FCore) {
  "use strict";

  // ── 심: PC 가 전역/다른 파일에서 받던 것들 ──
  // 시드는 심볼+주기로 고정한다(설계 §5). 크로스헤어·리사이즈로 매 프레임 다시 그려도
  // 같은 종목·같은 주기면 같은 꿈틀이다. 새 분석 결과는 vals 가 바뀌므로 시드를 흔들 필요가 없다.
  function seed(sym, tf) {
    var s = String(sym || "") + "|" + String(tf || ""), h = 2166136261 >>> 0, i;
    for (i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h >>> 0;
  }

  function _hzFmt(v) { return (Math.abs(v) < 10 ? v.toFixed(2) : Math.round(v).toLocaleString()); }   // forge-app.js:161
  function _normCdf(z) { const t = 1 / (1 + 0.2316419 * Math.abs(z)), d = 0.3989423 * Math.exp(-z * z / 2); let p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return z > 0 ? 1 - p : p; }   // forge-app.js:162
  /* 현재가 대비 상승확률(%) — 로그정규: m=log(예측/현재), sd=log(상단/예측) */
  function _upProb(pred, hi, anchor) {                                                                 // forge-app.js:164
    if (!(pred > 0 && hi > 0 && anchor > 0)) return 50;
    const m = Math.log(pred / anchor), sd = Math.log(hi / pred);
    return Math.round(_normCdf(m / (sd || 1e-6)) * 100);
  }
  function _hzList(unit, fb) {                                                                         // forge-app.js:169
    let hs = unit === "개월" ? [3, 6, 12, 24]
      : unit === "주" ? [13, 26, 39, 52]
      : unit === "일" ? [10, 20, 40, 60]
      : [Math.ceil(fb / 4), Math.ceil(fb / 2), Math.ceil(fb * 3 / 4), fb];
    return hs.filter(h => h >= 1 && h <= fb).filter((h, i, a) => a.indexOf(h) === i);
  }
  // forge-draw.js:3363 원문은 한글 TF 표기("일봉")만 판별한다. 모바일 TF 는 API 표기("1day")라
  // 영문 토큰을 함께 받도록 확장했다 — 이 심이 아니면 전부 "봉"으로 떨어져 마일스톤 점이 사라진다.
  function _tfUnit(tf) { return /월|month/i.test(tf) ? "개월" : /주|week/i.test(tf) ? "주" : /일|day/i.test(tf) ? "일" : "봉"; }
  // 표기용 확률: 그 봉의 예측 '방향'이 실현될 캘리브레이션 확률(%). 50 미만이면 반대가 우세 — 숨기지 않는다.
  function _predPCal(center, hi, anchor, k) {                                                          // forge-draw.js:71
    const raw = _upProb(center[k], hi[k], anchor);
    const cal = (FCore && FCore.calibrateUpProb) ? FCore.calibrateUpProb(raw) : raw;
    return (center[k] >= anchor) ? cal : (100 - cal);
  }
  // 라벨 충돌 레지스트리는 draw-layers.js 한 벌을 쓴다. Layers 가 없으면(단독 로드) 회피만 포기하고 그린다.
  function _reserve(b) { if (Layers && Layers.reservePredBox) Layers.reservePredBox(b); }
  function _obstacles() { return (Layers && Layers.axisBoxes) ? Layers.axisBoxes().concat(Layers.predBoxes()) : []; }
  function _fit(bx, by, bw, bh, minY, maxY) { return (Layers && Layers.fitBoxY) ? Layers.fitBoxY(bx, by, bw, bh, _obstacles(), minY, maxY) : by; }

  /* ===== 여기부터 forge-draw.js 원문 복사 (47-52, 56-69, 80-145, 1949-1957) ===== */
  const _CONF_HORIZON = 0.5;   // 이 아래로 떨어지는 첫 봉부터 선을 잇지 않고 점묘로 해체
  function _predBandW(loK, hiK) {
    if (!(loK > 0) || !(hiK > loK)) return 0;
    const w = Math.log(hiK / loK);
    return isFinite(w) && w > 0 ? w : 0;
  }
  // 총 밴드 확장분 중 어디까지 왔나(0=아직 안 벌어짐 → 1=끝까지 벌어짐)를 뒤집은 값.
  // W(0) 나눗셈은 쓰지 않는다 — 엔진이 콘을 seam 에서 인위적으로 좁게 시작시켜 W(0)이 왜곡돼 있고,
  // 그걸 기준으로 삼으면 예측 대부분이 즉시 점묘로 무너진다. W 는 단조 증가라 감쇠는 여전히 보장된다.
  function _predConfAt(lo, hi, k) {
    const n = lo.length; if (!(n > 0)) return 0;
    const w0 = _predBandW(lo[0], hi[0]), we = _predBandW(lo[n - 1], hi[n - 1]), wk = _predBandW(lo[k], hi[k]);
    if (!(wk > 0)) return 0;
    const span = we - w0;
    if (!(span > 0)) return 1;   // 밴드가 안 벌어지는 예측 = 감쇠 없음
    return Math.max(0, Math.min(1, 1 - (wk - w0) / span));
  }
  // 신뢰 지평 = conf 가 임계 아래로 처음 떨어지는 봉. k=0 은 반환하지 않음(seam 선과 겹치면 판독 불가).
  function _predHorizonK(lo, hi) {
    if (!lo || !hi || !lo.length) return null;
    for (let k = 1; k < lo.length; k++) if (_predConfAt(lo, hi, k) < _CONF_HORIZON) return k;
    return null;
  }
  function _mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }   // 결정론 PRNG(시드→재현)
  // 계산된 꿈틀: S/R 자석 반응(꺾임=실제 레벨) + AR 결(종목 실제 단기 자기상관).
  // center=예측 중앙값 배열, levels=엔진 S/R가격, tex=엔진 AR2 질감(nullable). → [-1,1] 정규화 시퀀스.
  const _SR_W = 1.0, _AR_W = 0.4;   // 조정 상수: S/R 반응(꺾임=레벨) 비중 · AR 결(레벨 사이 미세) 비중
  function _predWigSeqSR(n, center, lo, hi, levels, tex, seed) {
    // 예측선이 지나는 가격범위 안의 유의 레벨(정렬·근접중복 제거) — 이 레벨들이 반등/하락 지점이 됨
    let cMin = Infinity, cMax = -Infinity; for (let k = 0; k < n; k++) { if (center[k] < cMin) cMin = center[k]; if (center[k] > cMax) cMax = center[k]; }
    const pad = (cMax - cMin) * 0.15 || 1, tol = (cMax - cMin) * 0.01 || 1e-6;
    const rel = (Array.isArray(levels) ? levels : []).filter(v => isFinite(v) && v > cMin - pad && v < cMax + pad).sort((a, b) => a - b);
    const uniq = []; for (const L of rel) if (!uniq.length || L - uniq[uniq.length - 1] > tol) uniq.push(L);   // 근접 중복 제거
    // AR 결: 엔진 tex(실데이터 자기상관) 우선, 없으면 최소 시드 결
    const rnd = _mulberry32(seed >>> 0), ar = new Array(n); let x = 0, arMax = 1e-9;
    for (let k = 0; k < n; k++) { if (tex && isFinite(tex[k])) ar[k] = tex[k]; else { x = x * 0.7 + (rnd() * 2 - 1) * 0.5; ar[k] = x; } const a = Math.abs(ar[k]); if (a > arMax) arMax = a; }
    // S/R 반응: center 가 지나는 레벨을 위상 경계로 → 각 레벨에서 위상이 π만큼 진행, cos 로 레벨에 극값(반등/하락) 배치
    const out = new Array(n); let mx = 1e-9;
    for (let k = 0; k < n; k++) {
      const c0 = center[k];
      let pull = 0;
      if (uniq.length) {
        let iLo = -1; for (let j = 0; j < uniq.length; j++) { if (uniq[j] <= c0) iLo = j; else break; }
        const La = iLo >= 0 ? uniq[iLo] : (cMin - pad), Lb = iLo + 1 < uniq.length ? uniq[iLo + 1] : (cMax + pad), idx = iLo + 1;   // 아래 레벨 인덱스(경계 포함)
        const prog = (Lb > La) ? (c0 - La) / (Lb - La) : 0;                 // 아래 레벨→위 레벨 진행도
        pull = Math.cos((idx + Math.max(0, Math.min(1, prog))) * Math.PI);  // 레벨(정수 위상)에서 |pull|=1(극값) · 사이에서 0통과
      }
      out[k] = _SR_W * pull + _AR_W * (ar[k] / arMax);
      const a = Math.abs(out[k]); if (a > mx) mx = a;
    }
    for (let k = 0; k < n; k++) out[k] /= mx;   // [-1,1]
    return out;
  }
  // 꿈틀 y값(가격): center + 진폭·워크값(wv∈[-1,1])·신뢰도(conf), 밴드[lo,hi] 하드 클램프.
  function _predWigVal(center, loK, hiK, wv, conf) {
    const amp = 0.5 * ((hiK - loK) / 2), cf = (conf == null || !isFinite(conf)) ? 1 : conf;
    const v = center + amp * wv * cf;
    return Math.max(loK, Math.min(hiK, v));
  }
  // 봉별 신뢰도 배열 + 실선/점묘 경계. 1·2·3차가 같은 계산을 쓰도록 한 곳에 둔다.
  function _predConfSeq(lo, hi) {
    const n = lo.length, cf = new Array(n);
    for (let k = 0; k < n; k++) cf[k] = _predConfAt(lo, hi, k);
    const kh = _predHorizonK(lo, hi);
    return { conf: cf, kEnd: (kh == null) ? n : kh };
  }
  // 예측선 공통 스트로크: 신뢰 구간은 봉별 알파·굵기 세그먼트 실선, 신뢰 지평 이후는 점묘.
  // 점묘는 '연결된 경로'라는 주장 자체를 철회하는 표현이므로 1·2·3차가 반드시 같은 규칙을 공유해야 한다.
  // 좌표 변환·클램프는 호출부마다 다르므로 xAt/yAt 콜백으로 주입받는다.
  function _strokePredLine(c, o) {
    const n = o.n; if (!(n > 0)) return;
    c.save(); c.lineJoin = "round"; c.lineCap = "round";
    let x0 = o.x0, y0 = o.y0;
    for (let k = 0; k < o.kEnd; k++) {
      const x1 = o.xAt(k), y1 = o.yAt(k); if (!isFinite(x1) || !isFinite(y1)) continue;
      c.strokeStyle = "rgba(" + o.rgb + "," + (0.25 + 0.75 * o.conf[k]).toFixed(3) + ")";
      c.lineWidth = o.lw * (0.55 + 0.45 * o.conf[k]);
      if (o.dash) c.setLineDash(o.dash); else c.setLineDash([]);
      c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
      x0 = x1; y0 = y1;
    }
    c.setLineDash([]);
    for (let k = o.kEnd; k < n; k++) {   // 지평 이후: 점만 — 사이를 잇지 않는다
      const x1 = o.xAt(k), y1 = o.yAt(k); if (!isFinite(x1) || !isFinite(y1)) continue;
      c.fillStyle = "rgba(" + o.rgb + "," + (0.15 + 0.35 * o.conf[k]).toFixed(3) + ")";
      c.beginPath(); c.arc(x1, y1, 1.3, 0, 7); c.fill();
    }
    c.restore();
  }
  // 지진 진앙지형 마커 — 글로우 코어. scale<1 이면 축소·감광(반대 예상선 끝점=1/3)
  function _epicenterMark(c, x, y, col, scale) {
    if (!isFinite(x) || !isFinite(y)) return;
    const sc = Math.max(0.46, scale || 1);   // 1/3이라도 최소 크기 확보(작지만 진앙지로 식별)
    c.save(); c.lineCap = "round";
    c.globalAlpha = 1; c.shadowColor = col; c.shadowBlur = 9 * sc; c.fillStyle = col;
    c.beginPath(); c.arc(x, y, 3.2 * sc, 0, 7); c.fill();
    c.shadowBlur = 0; c.globalAlpha = 1; c.fillStyle = "#fff"; c.beginPath(); c.arc(x, y, Math.max(1, 1.2 * sc), 0, 7); c.fill();
    c.restore();
  }
  /* ===== 원문 복사 끝 ===== */

  // 꿈틀 적용된 가격 수열. 호출부가 pToY 로 화면좌표로 옮긴다.
  // 폴백: tex 도 levels 도 없으면 꿈틀을 만들 근거가 아예 없다 → 원본 그대로(매끈).
  // PC 는 tex 가 없을 때 PRNG 결을 지어내지만 그건 데이터가 아니라 발명이다.
  // levels 만 있어도 계산한다 — 꿈틀의 주항(_SR_W=1.0)이 바로 그 S/R 반응이기 때문이다.
  function wiggle(n, vals, lo, hi, levels, tex, sd) {
    var out = new Array(n), k;
    var hasTex = !!(tex && tex.length), hasLv = !!(levels && levels.length);
    if (!hasTex && !hasLv) { for (k = 0; k < n; k++) out[k] = vals[k]; return out; }
    var seq = _predWigSeqSR(n, vals, lo, hi, levels, tex, sd);
    var cs = _predConfSeq(lo, hi);
    for (k = 0; k < n; k++) out[k] = _predWigVal(vals[k], lo[k], hi[k], seq[k], cs.conf[k]);
    return out;
  }

  // forge-draw.js:1959-2000(_predEndDeco) — 인자만 객체로 묶고, _reserve/_fitBoxY 를 MSLayers 공유본으로 돌렸다.
  // 흘러가는 마일스톤 점 + 끝점 진앙 + 차수 라벨 + 끝점 예측가.
  function endDeco(c, o) {
    var pathArr = o.path, pl = pathArr && pathArr.length; if (!pl) return;
    var seamX = o.seamX, coneR = o.coneR, toY = o.toY, box = o.box, col = o.col;
    var tX = function (k) { return seamX + ((k + 1) / pl) * (coneR - seamX); };
    try {
      var mhs = _hzList(_tfUnit(o.tf), pl), i;
      for (i = 0; i < mhs.length; i++) {
        var h = mhs[i]; if (h < 1 || h >= pl) continue;
        var mx = tX(h - 1), my = toY(pathArr[h - 1]);
        if (isFinite(mx) && isFinite(my)) {
          c.fillStyle = col; c.beginPath(); c.arc(mx, my, 2, 0, 7); c.fill();
          c.strokeStyle = "#0b0f14"; c.lineWidth = 1; c.stroke();
        }
      }
    } catch (e) {}
    var ex = Math.min(coneR, box.padX + box.plotW - 12);
    var ey = Math.max(box.padTop + 14, Math.min(box.ch - box.padBot - 14, toY(pathArr[pl - 1])));
    _epicenterMark(c, ex, ey, col, col === "#8a92b2" ? 0.6 : 1);   // 반대 우세(회색 강등)면 목표 마커도 약하게
    // 배지와 끝점 예측가는 끝점이 서로 가까우면 고정 오프셋만으로 겹쳤다(우측 라벨 더미).
    // 빈 슬롯에 배치하고 자리를 예약해 근거 라벨(_evLabel)도 이를 피하게 한다.
    var _minY = box.padTop + 2, _maxY = box.ch - box.padBot - 2;
    if (o.label) {
      c.save(); c.font = "800 11px Pretendard,'Malgun Gothic',sans-serif"; c.textAlign = "right";
      var _lw = c.measureText(o.label).width, _lx = ex - 10;
      var _bx = _lx - _lw - 7, _bw = _lw + 10, _bh = 15;
      var _want = ey + (o.labelDy != null ? o.labelDy : -13) - 10;
      var _by = _fit(_bx, _want, _bw, _bh, _minY, _maxY);
      if (_by != null) {
        c.fillStyle = "rgba(11,15,20,.86)";
        if (c.roundRect) { c.beginPath(); c.roundRect(_bx, _by, _bw, _bh, 4); c.fill(); } else c.fillRect(_bx, _by, _bw, _bh);
        c.strokeStyle = col; c.globalAlpha = .5; c.lineWidth = 1;
        if (c.roundRect) { c.beginPath(); c.roundRect(_bx + .5, _by + .5, _bw - 1, _bh - 1, 4); c.stroke(); }
        c.globalAlpha = 1;
        c.fillStyle = col; c.fillText(o.label, _lx, _by + 10);
        _reserve({ x: _bx, y: _by, w: _bw, h: _bh });
      }
      c.restore();
    }
    if (o.showPx && isFinite(pathArr[pl - 1])) {   // 끝점 예측가 = 라인색 폰트(끝점 옆)
      c.save(); c.font = "800 10.5px ui-monospace,monospace"; c.textAlign = "right";
      var _pv = _hzFmt(pathArr[pl - 1]), _pw = c.measureText(_pv).width;
      var _pxx = ex - 8, _pbx = _pxx - _pw - 6, _pbw = _pw + 9, _pbh = 14;
      var _pwant = Math.max(box.padTop + 9, Math.min(box.ch - box.padBot - 4, ey - (o.labelDy != null ? o.labelDy : -13))) - 10;
      var _pby = _fit(_pbx, _pwant, _pbw, _pbh, _minY, _maxY);
      if (_pby != null) {
        c.fillStyle = "rgba(11,15,20,.72)";
        if (c.roundRect) { c.beginPath(); c.roundRect(_pbx, _pby, _pbw, _pbh, 3); c.fill(); }
        c.fillStyle = col; c.fillText(_pv, _pxx - 1, _pby + 10);
        _reserve({ x: _pbx, y: _pby, w: _pbw, h: _pbh });
      }
      c.restore();
    }
  }

  return { seed: seed,
           confAt: _predConfAt, confSeq: _predConfSeq,
           wigSeq: _predWigSeqSR, wiggle: wiggle,
           strokeLine: _strokePredLine,
           epicenter: _epicenterMark, pcal: _predPCal, endDeco: endDeco };
});
