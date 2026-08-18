#!/usr/bin/env node
// 브라우저 관문 — 화면을 실제로 열어본다.
//
// 왜 필요한가: 노드 테스트는 모듈을 require 로 각각 독립 객체로 받는다. 브라우저 전역
// 하나를 두 파일이 다투는 사고(2026-08-18 MSPreds)를 원리적으로 못 본다. 1505건이 초록인
// 채로 앱의 본체가 죽어 있었다. 이 관문이 그 구멍이다.
//
// 의존성 0 — 이미 있는 크로미움 바이너리를 CLI 로 몬다(저장소 규율: 빌드 도구 없음).
// 한 번의 실행에서 셋을 얻는다: 콘솔 로그(stderr) · 단언 결과(document.title) · 스크린샷.
import { spawn, spawnSync, execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import https from "node:https";
import { ROUTES } from "./gate-routes.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));      // mobile/
const WWW = path.join(ROOT, "www");
const OUT = path.join(ROOT, "docs/rebuild/shots");
const WORK = path.join(ROOT, "tools/.gate");
const PORT = 8943;
const HOST = "parksvc.mycafe24.com";
const CHROME = path.join(process.env.HOME, ".cache/ms-playwright/chromium-1228/chrome-linux64/chrome");

// ── ① 포트 좀비 확인 ─────────────────────────────────────────────────────────
// 2026-08-18 대조에서 전날 세션의 서버가 포트를 잡고 있어 새 mock 이 한 번도 안 떴다.
// 조용히 옛 결과를 보게 되는 종류의 사고라, 관문은 이걸 먼저 확인하고 죽는다.
function assertPortFree() {
  const r = spawnSync("ss", ["-lntp"], { encoding: "utf8" });
  if (r.status !== 0) return;                       // ss 가 없으면 통과(치명적이지 않다)
  const line = (r.stdout || "").split("\n").find(l => l.includes(":" + PORT + " "));
  if (line) {
    console.error("포트 " + PORT + " 가 이미 점유돼 있다 — 옛 서버의 결과를 보게 된다:\n  " + line.trim());
    process.exit(1);
  }
}

if (!existsSync(CHROME)) {
  console.error("크로미움 바이너리가 없다: " + CHROME);
  process.exit(1);
}

// ── 공유 라이브러리(캐시) ────────────────────────────────────────────────────
// 이 WSL 환경엔 sudo 가 없고 libnspr4/libnss3/libasound2 가 시스템에 없어 chrome 바이너리가
// 그냥은 안 뜬다(headless-shot.sh 에서 실측한 대응). apt-get download 는 설치가 아니라
// 다운로드라 권한이 필요 없다 — dpkg-deb -x 로 로컬에 펼쳐 LD_LIBRARY_PATH 로만 먹인다.
// mobile/tools/.gate/ 에 캐시해 매 실행마다 다시 받지 않는다(첫 실행만 느리다).
function ensureLibs() {
  const dir = path.join(WORK, "libs");
  const marker = path.join(dir, "libnspr4.so");
  if (existsSync(marker)) return dir;
  mkdirSync(dir, { recursive: true });
  const tmp = path.join(WORK, "libs-dl");
  mkdirSync(tmp, { recursive: true });
  for (const pkg of ["libnspr4", "libnss3", "libasound2t64"]) {
    spawnSync("apt-get", ["download", pkg], { cwd: tmp, stdio: "ignore" });
  }
  const debs = spawnSync("sh", ["-c", "ls *.deb"], { cwd: tmp, encoding: "utf8" }).stdout
    .split("\n").map(s => s.trim()).filter(Boolean);
  for (const deb of debs) {
    spawnSync("dpkg-deb", ["-x", deb, tmp + "/root"], { cwd: tmp, stdio: "ignore" });
  }
  const libDir = path.join(tmp, "root/usr/lib/x86_64-linux-gnu");
  if (existsSync(libDir)) {
    for (const f of readdirSync(libDir)) {
      writeFileSync(path.join(dir, f), readFileSync(path.join(libDir, f)));
    }
  }
  rmSync(tmp, { recursive: true, force: true });
  if (!existsSync(marker)) {
    console.error("공유 라이브러리를 못 받았다(apt-get download 실패?) — libnspr4.so 없음: " + dir);
    process.exit(1);
  }
  return dir;
}

// ── 자체서명 인증서(캐시) ────────────────────────────────────────────────────
// https 여야 하는 이유: app.js 가 개발 스킴(http:/file:)에서 지갑 설치를 거부한다.
function ensureCert() {
  mkdirSync(WORK, { recursive: true });
  const key = path.join(WORK, "key.pem"), crt = path.join(WORK, "cert.pem");
  if (!existsSync(key) || !existsSync(crt)) {
    execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-keyout", key, "-out", crt,
      "-days", "30", "-nodes", "-subj", "/CN=" + HOST], { stdio: "ignore" });
  }
  return { key: readFileSync(key), cert: readFileSync(crt) };
}

// ── 합성 OHLC · 지갑 mock ────────────────────────────────────────────────────
// 실서버를 부르지 않는다. 관문이 네트워크에 의존하면 관문이 아니라 날씨가 된다.
function candles() {
  const out = [], day = new Date("2026-08-17T00:00:00Z");
  for (let i = 0; i < 360; i++) {
    const v = 200 + i * 0.12 + Math.sin(i / 11) * 6 + Math.sin(i / 37) * 14;
    const t = new Date(day.getTime() - (359 - i) * 86400000).toISOString().slice(0, 10);
    out.push({ t, o: +(v - 1).toFixed(2), h: +(v + 1.8).toFixed(2), l: +(v - 1.6).toFixed(2),
               c: +v.toFixed(2), v: 1000000 + (i % 23) * 40000 });
  }
  return out;
}
const STATE = { balance: 9, cap: 20, streak: 3, checkedIn: true, today: "2026-08-17" };
const WALLET = {
  hello: { ok: true, token: "t", accountId: "a1", state: STATE },
  get: { ok: true, state: STATE },
  spend: { ok: true, state: STATE, charged: false },
  checkin: { ok: true, state: STATE, granted: 1, capped: false },
  adConfig: { ok: true, quick: { unitId: "q", reward: 1, secs: 15 },
              full: { unitId: "f", reward: 3, secs: 30 }, customData: "cd" },
  adState: { ok: true, remaining: 6, nextAt: null }
};

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
               ".json": "application/json", ".woff2": "font/woff2", ".png": "image/png" };

function serve(creds) {
  return https.createServer(creds, (req, res) => {
    if (req.method === "POST") {
      let body = "";
      req.on("data", d => { body += d; });
      req.on("end", () => {
        let op = "";
        try { op = JSON.parse(body || "{}").op || ""; } catch (e) {}
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(WALLET[op] || { ok: true }));
      });
      return;
    }
    const url = decodeURIComponent(req.url.split("?")[0]);
    if (url === "/map/forge-api.php") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, tf: "1day", symbol: "AAPL", candles: candles() }));
      return;
    }
    const file = path.join(WWW, url.replace(/^\/+/, ""));
    if (!file.startsWith(WWW) || !existsSync(file)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
    res.end(readFileSync(file));
  });
}

// ── 프로브 페이지 ────────────────────────────────────────────────────────────
// 상태를 심고 → 라우트로 이동 → 단언을 돌려 document.title 에 GATE:{json} 으로 적는다.
function probe(route) {
  const base = readFileSync(path.join(WWW, "index.html"), "utf8");
  const TAG = '<script src="app.js"></script>';
  let js = "<script>try{localStorage.clear();";
  for (const [k, v] of Object.entries(route.seed || {})) {
    js += "localStorage.setItem(" + JSON.stringify(k) + "," + JSON.stringify(JSON.stringify(v)) + ");";
  }
  js += "}catch(e){}</script>\n" + TAG;
  if (route.go) js += '\n<script>setTimeout(function(){try{MSApp.go(' + route.go + ');}catch(e){console.error("GO_FAILED",e);}},400);</script>';
  js += '\n<script>setTimeout(function(){var ok=false,err="";' +
        'try{ok=!!(' + route.assert + ');}catch(e){err=String(e);}' +
        'document.title="GATE:"+JSON.stringify({ok:ok,err:err});},' + (route.delay || 1500) + ');</script>';
  const name = "__gate_" + route.name + ".html";
  writeFileSync(path.join(WWW, name), base.replace(TAG, js));
  return name;
}

// ── 실행 ─────────────────────────────────────────────────────────────────────
// spawnSync 를 쓰면 안 된다 — 이 프로세스가 chrome 의 요청을 받는 HTTPS 서버도 겸하는데,
// spawnSync 는 Node 의 이벤트 루프를 통째로 멈춘다. chrome 이 접속하는 순간 서버가 응답을
// 못 해 자기 자신과 교착한다(실측: curl 로 같은 포트를 찔러도 TLS 핸드셰이크에서 영원히
// 걸림 — dump-dom 이 늘 "연결 실패" 더미 페이지만 받았다). 비동기 spawn 으로 event loop 를
// 비워 둬야 서버가 그 사이에 요청을 처리한다.
function shoot(route, page, libDir) {
  const args = ["--headless=new", "--disable-gpu", "--no-sandbox", "--ignore-certificate-errors",
    "--host-resolver-rules=MAP " + HOST + ":443 127.0.0.1:" + PORT + ", MAP * 127.0.0.1:1, EXCLUDE 127.0.0.1",
    "--enable-logging=stderr", "--v=0", "--window-size=390,1000",
    "--screenshot=" + path.join(OUT, "app-" + route.name + ".png"),
    "--dump-dom", "--virtual-time-budget=" + ((route.delay || 1500) + 3000),
    "https://" + HOST + "/" + page];
  return new Promise((resolve) => {
    const child = spawn(CHROME, args, {
      env: Object.assign({}, process.env, { LD_LIBRARY_PATH: libDir })
    });
    let dom = "", log = "";
    child.stdout.on("data", d => { dom += d; });
    child.stderr.on("data", d => { log += d; });
    child.on("close", () => resolve({ dom, log }));
    child.on("error", (e) => resolve({ dom: "", log: "PROC_ERROR " + String(e) }));
  });
}

function judge(route, res) {
  const problems = [];
  // ② 콘솔 오류 0 — 전역 중복 등록(globals.js throw)도 여기로 떨어진다
  for (const line of res.log.split("\n")) {
    if (!/CONSOLE|Uncaught/.test(line)) continue;
    if (/ERROR:CONSOLE|SEVERE|Uncaught/.test(line)) problems.push("콘솔 오류: " + line.trim());
  }
  // ③ 단언
  const m = res.dom.match(/<title>GATE:([\s\S]*?)<\/title>/);
  if (!m) problems.push("단언이 실행되지 않았다(title 없음) — 화면이 그려지기 전에 죽었을 수 있다");
  else {
    let v = {};
    try {
      const raw = m[1].replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">").replace(/&amp;/g, "&");
      v = JSON.parse(raw);
    } catch (e) { problems.push("단언 결과 파싱 실패: " + m[1]); }
    if (!v.ok) problems.push("단언 실패: " + route.assert + (v.err ? " (" + v.err + ")" : ""));
  }
  return problems;
}

assertPortFree();
mkdirSync(OUT, { recursive: true });
const libDir = ensureLibs();
const creds = ensureCert();
const server = serve(creds);
await new Promise(r => server.listen(PORT, "127.0.0.1", r));

const only = process.argv.slice(2);
const routes = only.length ? ROUTES.filter(r => only.includes(r.name)) : ROUTES;
let failed = 0;
for (const route of routes) {
  // 프로브 페이지는 try/finally 로 지운다 — 이 안에서 예외가 나도(예: 크로미움이 죽는다)
  // www/ 에 __gate_*.html 이 남으면 안 된다(작업 트리에 남기지 않는다는 요구사항).
  const page = probe(route);
  try {
    const problems = judge(route, await shoot(route, page, libDir));
    if (problems.length) { failed++; console.log("✗ " + route.name); problems.forEach(p => console.log("    " + p)); }
    else console.log("✓ " + route.name);
  } finally {
    rmSync(path.join(WWW, page), { force: true });
  }
}
server.close();
console.log(failed ? "\n브라우저 관문 실패 " + failed + "건" : "\n브라우저 관문 " + routes.length + "건 통과");
process.exit(failed ? 1 : 0);
