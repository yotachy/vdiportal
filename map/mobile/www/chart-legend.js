// 차트 위 고정 레전드의 행 데이터. 순수 함수 — DOM 을 만들지 않는다.
// DOM 을 반환하면 노드에서 값으로 검증할 수 없어서 이렇게 갈랐다. 조립은 report.js 담당.
// 상태 문구(aligned up·squeeze·confirming)는 시계열 전체 판정이라 fi 와 무관하게 고정하고,
// fi 를 따라 바뀌는 것은 숫자뿐이다 — 안 그러면 과거 봉에서 "지금 정배열"이 거짓이 된다.
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports)
    module.exports = factory(require("./strings.js"), require("./draw-preds.js"));
  else root.MSLegend = factory(root.MSStr, root.MSPreds);
})(typeof self !== "undefined" ? self : this, function (Str, Preds) {
  "use strict";

  var T = (Str && Str.t) || {};
  function ind(bt) { return (Str && Str.ind) ? Str.ind(bt) : bt; }
  function num(v) { return (Math.abs(v) < 10 ? v.toFixed(2) : Math.round(v).toLocaleString()); }
  function at(arr, fi, fallback) {
    if (!arr || !arr.length) return fallback;
    var k = (fi == null) ? arr.length - 1 : Math.max(0, Math.min(arr.length - 1, fi));
    return isFinite(arr[k]) ? arr[k] : fallback;
  }
  function biasTone(b) { return b > 0.15 ? "bull" : b < -0.15 ? "bear" : "muted"; }

  var BB_STATE = { breakout_up: "upper breakout", breakout_dn: "lower breakdown",
                   upper: "upper band", lower: "lower band", neutral: "mid band" };
  var VOL_STATE = { spike: "spike", contract: "contracting", normal: "normal" };
  var VOL_REL = { confirm: "confirming", weakening: "weakening",
                  selling: "selling pressure", capitulation: "capitulation" };
  var MA_ALIGN = { bull: "aligned up", bear: "aligned down", mixed: "mixed" };

  function rows(an, pred, fi) {
    var out = [];

    // MA — 정렬·지지/저항은 전체 판정이라 fi 무관
    var ma = an.ma, maTxt = MA_ALIGN[ma.align.order] || "mixed";
    if (ma.sr && ma.sr.ma) maTxt += " · " + (ma.sr.side === "support" ? "support" : "resistance");
    out.push({ key: "ma", label: ind("ma"), value: maTxt, tone: biasTone(ma.bias) });

    // MACD — 히스토그램은 봉별, 교차는 전체 판정
    var m = an.macd, h = at(m.hist, fi, 0);
    var cross = (m.cross && m.cross.type)
      ? (m.cross.type === "bull" ? T.cxGolden : T.cxDead) + m.cross.barsAgo
      : "no cross";
    out.push({ key: "macd", label: ind("macd"),
               value: (h >= 0 ? "+" : "") + h.toFixed(1) + " · " + cross,
               tone: biasTone(m.bias) });

    // RSI — 값은 봉별, 구간 문구는 그 값에서 바로 나오므로 함께 따라간다
    var r = an.rsi, rv = at(r.series, fi, r.last);
    var rz = rv >= 70 ? "overbought" : rv <= 30 ? "oversold" : "neutral";
    out.push({ key: "rsi", label: ind("rsi"), value: Math.round(rv) + " · " + rz,
               tone: rz === "overbought" ? "bear" : rz === "oversold" ? "bull" : "muted" });

    // 볼린저 — %B 는 봉별, 밴드 상태·스퀴즈는 전체 판정
    var b = an.bb, pb = at(b.pctB, fi, (b.last && b.last.pctB) || 0);
    out.push({ key: "bb", label: ind("bollinger"),
               value: (BB_STATE[b.state] || "mid band") + (b.squeeze ? " · squeeze" : "") + " · %B " + pb.toFixed(2),
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
      out.push({ key: "predpx", label: T.legTarget, value: num(pred.path[n - 1]),
                 tone: pc < 50 ? "muted" : (up ? "bull" : "bear") });
    } else {
      out.push({ key: "pred", label: T.legPred, value: "—", tone: "muted" });
      out.push({ key: "predpx", label: T.legTarget, value: "—", tone: "muted" });
    }
    return out;
  }

  return { rows: rows };
});
