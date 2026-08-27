// 머니스쿱 시그널 스캐너 — 하루 1회(07:00 KST) 한 번 실행 = 한 번의 전체 스캔 패스.
// 앱이 꺼져 있어도 관심종목을 대신 훑는다. 감지·판정은 앱과 같은 원본을 require 한다(사본 0).
//   node scan/scanner.mjs [--dry-run] [--config scan/scanner.config.json]
// 종료코드 0 = 정상(발송 0건이어도 정상), 1 = 실패.
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { symbolUnion, buildSends } from "./scan-core.mjs";

const require = createRequire(import.meta.url);
const signals = require("../app/app-signals.js");
const engine = require("../app/app-engine.js");
const config = require("../app/app-config.js");

const argv = process.argv.slice(2);
const DRY = argv.indexOf("--dry-run") >= 0;
const ci = argv.indexOf("--config");
const CONF_PATH = ci >= 0 ? argv[ci + 1] : fileURLToPath(new URL("./scanner.config.json", import.meta.url));

function loadConf() {
  const raw = JSON.parse(readFileSync(CONF_PATH, "utf8"));
  if (!raw.serverBase || !raw.scannerKey) throw new Error("config: serverBase·scannerKey 필수");
  return { serverBase: String(raw.serverBase).replace(/\/+$/, ""), scannerKey: String(raw.scannerKey), batch: raw.batch || 50 };
}

async function api(conf, body) {
  const r = await fetch(conf.serverBase + "/app-api.php", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Scan-Key": conf.scannerKey },
    body: JSON.stringify(body)
  });
  const j = await r.json().catch(() => null);
  if (!j || j.ok !== true) throw new Error("api " + body.op + ": " + (j && j.error ? j.error : r.status));
  return j;
}

async function ohlc(conf, sym) {
  // 전량 이력 — 판정은 이력 길이에 의존한다(봉 전송 정책 2026-08-25). limit 금지.
  const r = await fetch(conf.serverBase + "/forge-api.php?ohlc=1&symbol=" + encodeURIComponent(sym) + "&tf=1day");
  const j = await r.json().catch(() => null);
  return (j && j.ok && Array.isArray(j.candles) && j.candles.length) ? j.candles : null;
}

function kstDay(now) {
  const t = new Date(now + 9 * 3600000);
  const p = (v) => String(v).padStart(2, "0");
  return t.getUTCFullYear() + "-" + p(t.getUTCMonth() + 1) + "-" + p(t.getUTCDate());
}

async function main() {
  const conf = loadConf();
  const POLICY = config.POLICY;
  const reg = (await api(conf, { op: "scan_registry" })).registry || [];
  const syms = symbolUnion(reg);
  const signalsBySym = {}, verdictBySym = {};
  const errs = [];

  for (const sym of syms) {
    try {
      const candles = await ohlc(conf, sym);
      if (!candles) { errs.push(sym + ":ohlc"); continue; }
      const det = signals.detect(sym, candles);
      if (!det.length) continue;                       // 감지 0건이면 판정도 필요 없다(엔진 호출 절약)
      signalsBySym[sym] = det;
      const rep = await engine.analyze({ symbol: sym, tfKo: "일", tier: POLICY.signal.verdictTier, candles: candles });
      verdictBySym[sym] = { regime: rep.verdict.regime, prob: rep.verdict.prob };
    } catch (e) { errs.push(sym + ":" + (e && e.message ? e.message : "err")); }
  }

  const sends = buildSends(reg, signalsBySym, verdictBySym,
    { conv: POLICY.signal.conv, cap: POLICY.signal.pushCap, day: kstDay(Date.now()) });

  const result = { queued: 0, sent: 0, skipped: 0, failed: 0 };
  if (!DRY) {
    for (let i = 0; i < sends.length; i += conf.batch) {
      const r = await api(conf, { op: "push_send", sends: sends.slice(i, i + conf.batch) });
      ["queued", "sent", "skipped", "failed"].forEach((k) => { result[k] += (r[k] || 0); });
    }
  }
  console.log(JSON.stringify({ at: new Date().toISOString(), devices: reg.length, symbols: syms.length,
    detected: Object.keys(signalsBySym).length, sends: sends.length, dryRun: DRY, result: result, errors: errs }));
}

main().catch((e) => { console.error(String(e && e.stack ? e.stack : e)); process.exit(1); });
