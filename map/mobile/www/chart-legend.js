// 차트 위 고정 레전드의 행 데이터. 순수 함수 — DOM 을 만들지 않는다.
// DOM 을 반환하면 노드에서 값으로 검증할 수 없어서 이렇게 갈랐다. 조립은 report.js 담당.
// 상태 문구(aligned up·squeeze·confirming)는 시계열 전체 판정이라 fi 와 무관하게 고정하고,
// fi 를 따라 바뀌는 것은 숫자뿐이다 — 안 그러면 과거 봉에서 "지금 정배열"이 거짓이 된다.
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports)
    module.exports = factory(require("./strings.js"), require("./draw-preds.js"));
  else MSGlobals.define("MSLegend", factory(root.MSStr, root.MSPredDraw));
})(typeof self !== "undefined" ? self : this, function (Str, Preds) {
  "use strict";

  var T = (Str && Str.t) || {};
  function ind(bt) { return (Str && Str.ind) ? Str.ind(bt) : bt; }
  // 목표가는 시안이 두 자리(target 170.70)로 못박았다. Phase 3 에서 차트의 끝점 예측가 라벨이
  // 사라지므로 이 값과 보조를 맞출 형제 라벨이 더는 없다 — 앱 공통 num() 규칙에서 의도적으로 갈라진다.
  // 다만 큰 수(코인)에서 소수 두 자리는 소음이라 1000 이상은 종전대로 반올림한다.
  function priceTxt(v) {
    return Math.abs(v) < 1000 ? v.toFixed(2) : Math.round(v).toLocaleString();
  }
  function at(arr, fi, fallback) {
    if (!arr || !arr.length) return fallback;
    var k = (fi == null) ? arr.length - 1 : Math.max(0, Math.min(arr.length - 1, fi));
    return isFinite(arr[k]) ? arr[k] : fallback;
  }
  function biasTone(b) { return b > 0.15 ? "bull" : b < -0.15 ? "bear" : "muted"; }

  // Fix round 1: 값 자체는 그대로(레전드가 정본) — 소스만 strings.js 공유 맵으로 옮겨서
  // draw-layers.js(캔버스 배지)와 표기가 다시 갈라지지 않게 한다.
  var BB_STATE = (Str && Str.BB_STATE) || {};
  var VOL_STATE = (Str && Str.VOL_STATE) || {};
  var VOL_REL = (Str && Str.VOL_REL) || {};
  var MA_ALIGN = (Str && Str.MA_ALIGN) || {};
  var RSI_ZONE = (Str && Str.RSI_ZONE) || {};   // Fix round 2: RSI 만 빠져 있었다
  var SR = (Str && Str.SR) || {};               // Fix 2: support/resistance 공유

  function rows(an, pred, fi) {
    var out = [];

    // MA — 정렬·지지/저항은 전체 판정이라 fi 무관
    var ma = an.ma, maTxt = MA_ALIGN[ma.align.order] || "mixed";
    if (ma.sr && ma.sr.ma) maTxt += " · " + (ma.sr.side === "support" ? SR.support : SR.resistance);
    out.push({ key: "ma", label: ind("ma"), value: maTxt, tone: biasTone(ma.bias) });

    // MACD — 히스토그램은 봉별, 교차는 전체 판정
    var m = an.macd, h = at(m.hist, fi, 0);
    var cross = (m.cross && m.cross.type)
      ? (m.cross.type === "bull" ? T.legGolden : T.legDead) + m.cross.barsAgo + T.legBars
      : T.legNoCross;
    // 반올림하면 0 이 되는 값에 부호를 달면, 크로스헤어를 끌 때 +0.0/-0.0 이 번갈아 나와
    // 고장난 것처럼 보인다. 부호는 실제로 표시되는 크기가 있을 때만 붙인다.
    var hTxt = (Math.abs(h) < 0.05) ? "0.0" : (h >= 0 ? "+" : "") + h.toFixed(1);
    out.push({ key: "macd", label: ind("macd"),
               value: hTxt + " · " + cross,
               tone: biasTone(m.bias) });

    // RSI — 값은 봉별, 구간 문구는 그 값에서 바로 나오므로 함께 따라간다
    var r = an.rsi, rv = at(r.series, fi, r.last);
    var rzKey = rv >= 70 ? "overbought" : rv <= 30 ? "oversold" : "neutral";
    var rz = RSI_ZONE[rzKey] || rzKey;
    out.push({ key: "rsi", label: ind("rsi"), value: Math.round(rv) + " · " + rz,
               tone: rzKey === "overbought" ? "bear" : rzKey === "oversold" ? "bull" : "muted" });

    // 볼린저 — %B 는 봉별, 밴드 상태·스퀴즈는 전체 판정
    var b = an.bb, pb = at(b.pctB, fi, (b.last && b.last.pctB) || 0);
    out.push({ key: "bb", label: ind("bollinger"),
               value: (BB_STATE[b.state] || "mid band") + (b.squeeze ? T.legSqueeze : "") + " · %B " + pb.toFixed(2),
               tone: biasTone(b.bias) });

    // 거래량 — 상태·가격관계 모두 전체 판정이라 fi 무관
    var v = an.va;
    out.push({ key: "vol", label: ind("volume"),
               value: (VOL_STATE[v.state] || "normal") + " · " + (VOL_REL[v.relationship] || "weakening"),
               tone: (v.relationship === "confirm" || v.relationship === "capitulation") ? "bull" : "bear" });

    // 예측 2행 — 미래에 대한 값이라 fi 무관. pred 가 없어도 행은 남긴다(레이아웃 흔들림 방지).
    var pOk = !!(pred && pred.path && pred.path.length && pred.hi && pred.hi.length);
    if (pOk) {
      var n = pred.path.length;
      var anchor = (pred.anchor != null) ? pred.anchor : pred.path[0];
      var pc = (Preds && Preds.pcal) ? Preds.pcal(pred.path, pred.hi, anchor, n - 1) : 50;
      var up = pred.path[n - 1] >= anchor;
      out.push({ key: "pred", label: T.legPred, value: pc + "%",
                 tone: pc < 50 ? "muted" : (up ? "bull" : "bear") });
      out.push({ key: "predpx", label: T.legTarget, value: priceTxt(pred.path[n - 1]),
                 tone: pc < 50 ? "muted" : (up ? "bull" : "bear") });
    } else {
      out.push({ key: "pred", label: T.legPred, value: "—", tone: "muted" });
      out.push({ key: "predpx", label: T.legTarget, value: "—", tone: "muted" });
    }
    return out;
  }

  // 시안 2a 의 "17 up · 6 flat · 9 down" 3구간 바용 집계. 판정에 실제로 쓰인 지표 행만 센다 —
  // 예측 2행(pred·predpx)은 지표가 아니라 결과라 제외하지 않으면 방향 개수가 부풀려진다.
  var NOT_INDICATOR = { pred: 1, predpx: 1 };
  function tally(rows) {
    var t = { up: 0, flat: 0, down: 0 };
    (rows || []).forEach(function (r) {
      if (!r || NOT_INDICATOR[r.key]) return;
      if (r.tone === "bull") t.up++;
      else if (r.tone === "bear") t.down++;
      else t.flat++;
    });
    return t;
  }

  return { rows: rows, tally: tally };
});
