"use strict";

const ABSENT_DEFAULTS = {
  pivot: {},
  psar: { step: 0.02, max: 0.2 },
  keltner: { len: 20, atrLen: 10, mult: 2 },
  donchian: { len: 20 },
  cci: { period: 20 },
  roc: { period: 12 },
  williams: { period: 14 },
  ao: { fast: 5, slow: 34 },
  aroon: { period: 25 },
  mfi: { period: 14 },
  cmf: { period: 20 },
};
const ABSENT = Object.keys(ABSENT_DEFAULTS);

module.exports = { ABSENT_DEFAULTS, ABSENT };
