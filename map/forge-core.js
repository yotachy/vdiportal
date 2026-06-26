(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.ForgeCore = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const version = "0.1.0";
  return { version };
});
