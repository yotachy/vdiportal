// 온보딩 품질 다섯 규칙(Q1~Q5)을 검사 가능한 API 로 바꾼 것 — 재설계 설계서 §5.
// 사용자 판정이 "개연성/스토리/UX/직관적으로 품질이 떨어져"였다. 문구를 고쳐서는 안
// 지켜진다 — 그래서 규칙을 어길 수 없는 헬퍼로 만든다: metric() 은 기준 시점 없이
// 부르면 던지고, stat() 은 해석 없이 부르면 던진다.
//
// Q1(metric) — 수치와 기준을 한 그룹으로 묶는다: 값만 있는 숫자는 언제 잰 것인지
// 모르면 오해를 부른다(예: 어제 종가를 오늘 것처럼 읽는다).
// Q5(stat)   — 수치 블록엔 항상 해석을 동반시킨다: 사용자는 "1.2%"가 좋은지 나쁜지
// 스스로 판단할 배경지식이 없다.
//
// Q2~Q4 는 렌더 결과·소스 형태를 재는 규칙이라 여기 API 가 아니라 각 단계 화면과
// test/onboarding.test.mjs 의 단언으로 강제한다(APPLIES 참고).
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else MSGlobals.define("MSObQuality", factory());
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // 노드 시험은 DOM 이 없다 — 최소 셰이프({textContent, appendChild})로 대신한다.
  // 브라우저에서는 이 분기를 타지 않는다(반드시 실제 DOM/MSUi.el 을 쓴다).
  function FallbackNode(text) {
    this._text = text != null ? String(text) : "";
    this._children = [];
  }
  FallbackNode.prototype.appendChild = function (child) {
    this._children.push(child);
    return child;
  };
  Object.defineProperty(FallbackNode.prototype, "textContent", {
    get: function () {
      var out = this._text, i;
      for (i = 0; i < this._children.length; i++) out += this._children[i].textContent;
      return out;
    }
  });

  // MSUi 는 여기서(호출 시점에) 참조한다 — 모듈 로드 시점에 별칭으로 잡아두면 이 파일이
  // ui.js 보다 먼저 실리는 환경에서 영원히 undefined 가 된다(이 저장소가 이미 겪은 함정,
  // screens/onboarding.js 의 MSStr 참조 주석 참고).
  function makeNode(tag, cls, text) {
    if (typeof document !== "undefined" && document.createElement) {
      return MSUi.el(tag, cls, text);
    }
    return new FallbackNode(text);
  }

  // 공백뿐인 문자열은 "값이 있다"로 치지 않는다 — asOf="   " 는 !opts.asOf 검사(falsy)를
  // 통과해 버려서 규칙을 뚫는 구멍이었다(리뷰 I1). "0" 은 유효한 값이라 계속 통과해야
  // 한다 — String(v).trim() 으로 앞뒤 공백만 걷어내고 내용이 남는지만 본다(숫자 0 을
  // falsy 로 오판하지 않는다).
  function hasContent(v) {
    return v != null && String(v).trim() !== "";
  }

  // Q1 — 수치와 기준 시점을 한 그룹으로 묶는다. asOf 없이는 만들 수 없다: 그것이
  // 규칙을 "어길 수 없게" 만드는 지점이다.
  function metric(opts) {
    opts = opts || {};
    if (!hasContent(opts.asOf)) {
      throw new Error("기준 시점(asOf) 없이 수치를 만들 수 없다 — 값만 있는 숫자는 언제 것인지 몰라 오해를 부른다");
    }
    var wrap = makeNode("div", "obq-metric");
    var row = makeNode("div", "obq-value-row");
    row.appendChild(makeNode("span", "obq-value", opts.value != null ? String(opts.value) : ""));
    if (opts.unit) row.appendChild(makeNode("span", "obq-unit", opts.unit));
    wrap.appendChild(row);
    if (opts.label) wrap.appendChild(makeNode("div", "obq-label", opts.label));
    wrap.appendChild(makeNode("div", "obq-asof", opts.asOf));
    return wrap;
  }

  // Q5 — 수치 블록엔 해석을 동반시킨다. meaning 없이는 만들 수 없다.
  function stat(opts) {
    opts = opts || {};
    if (!hasContent(opts.meaning)) {
      throw new Error("해석(meaning) 없이 수치 블록을 만들 수 없다 — 숫자만 던지면 사용자가 뜻을 모른다");
    }
    var wrap = makeNode("div", "obq-stat");
    if (opts.metric) wrap.appendChild(opts.metric);
    wrap.appendChild(makeNode("div", "obq-meaning", opts.meaning));
    return wrap;
  }

  // Task 3(1단계 콜드오픈)이 Q2·Q4 검사 대상으로 처음 등록한다 — 이후 단계는 각자 화면을
  // 완성하며 자기 번호를 여기 더한다. "APPLIES 가 비어 있으면 실패" 단언은 이제
  // test/onboarding.test.mjs·test/onboarding-quality.test.mjs 양쪽에 켜져 있다(컨트롤러
  // 판정, 2026-08-19) — 다음 태스크가 자기 단계 등록을 잊으면 그 관문이 빨갛게 알려준다.
  // Task 4(2단계 — 같은 구간 32개 전부)가 2 를 더한다.
  // Task 5(3단계 — 성향)가 3 을 더한다.
  // Task 6(4단계 동의 · 5단계 종목 선택·분석 시작)이 4·5 를 더한다.
  // Task 7(6단계 — 실제 분석: 오늘 종가·세 지평·근거)이 6 을 더한다.
  var APPLIES = [1, 2, 3, 4, 5, 6];

  return { metric: metric, stat: stat, APPLIES: APPLIES };
});
