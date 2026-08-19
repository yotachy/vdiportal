// 전역 이름 단일 출처. 모듈이 자기 이름을 여기에 등록하고, 이미 있으면 즉시 던진다.
//
// 이 파일이 존재하는 이유(2026-08-18 감사): draw-preds.js(작도)와 predictions.js(기록)가
// 둘 다 같은 전역 이름 하나를 등록했고, chart-draw.js 가 **로드 시점에** 전역을 캡처하는
// UMD 라 index.html 순서상 그때 기록 모듈이 이긴 뒤였다 — drawCone() 이 부르는 작도용
// seed 함수가 없어 리포트가 종목·티어와 무관하게 100% 죽었다(이후 MSPredDraw/MSPredLog로
// 분리됐다). 조용히 덮이는 대신 등록에서 죽게 만든다.
//
// 노드 테스트는 이 파일을 안 거친다(모듈마다 require 로 독립 객체를 받는다). 그래서
// 이 방어는 브라우저 전용이고, 짝이 되는 관문이 test/boot-smoke.test.mjs 다 — index.html
// 순서 그대로 vm 에 먹여 던지지 않는지, 그리고 UMD 팩토리 인자가 자기보다 먼저 실리는지를 잰다.
(function (root) {
  "use strict";
  var taken = {};

  function define(name, value) {
    if (Object.prototype.hasOwnProperty.call(taken, name)) {
      throw new Error("전역 이름 충돌: " + name + " 은 이미 등록됐다");
    }
    taken[name] = true;
    root[name] = value;
    return value;
  }

  function names() {
    var out = [], k;
    for (k in taken) { if (Object.prototype.hasOwnProperty.call(taken, k)) out.push(k); }
    return out.sort();
  }

  root.MSGlobals = { define: define, names: names };
})(typeof self !== "undefined" ? self : this);
