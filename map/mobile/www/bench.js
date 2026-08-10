// 실행시간 측정. 워밍업 1회로 JIT 을 데운 뒤 n회 표본을 뜬다 —
// 첫 호출은 컴파일 비용이 섞여 기기 성능을 과소평가하게 만든다.
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.MSBench = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function defaultClock() {
    return (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
  }

  function measure(fn, n, clock) {
    n = n || 5;
    clock = clock || defaultClock;
    fn();                                   // 워밍업 — 표본에 넣지 않는다
    var t = [];
    for (var i = 0; i < n; i++) {
      var a = clock();
      fn();
      t.push(clock() - a);
    }
    t.sort(function (x, y) { return x - y; });
    return { median: t[Math.floor((t.length - 1) / 2)], min: t[0], max: t[t.length - 1], n: n, samples: t };
  }

  return { measure: measure };
});
