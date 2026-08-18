#!/usr/bin/env node
// 브라우저 관문 — 화면을 실제로 열어본다.
//
// 왜 필요한가: 노드 테스트는 모듈을 require 로 각각 독립 객체로 받는다. 브라우저 전역
// 하나를 두 파일이 다투는 사고(2026-08-18 MSPreds)를 원리적으로 못 본다. 1505건이 초록인
// 채로 앱의 본체가 죽어 있었다. 이 관문이 그 구멍이다.
//
// 크로미움 실행 자체는 의존성 0(이미 있는 바이너리를 CLI 로 몬다, 저장소 규율: 빌드 도구
// 없음) — 단 그 바이너리를 이 WSL 환경에서 띄우려면 apt-get download 로 공유 라이브러리
// (libnspr4/libnss3/libasound2) 를 받아야 한다(ensureLibs, sudo 불요·설치 아닌 다운로드).
// 한 번의 실행에서 넷을 얻는다: 페이지 안에서 직접 모은 콘솔 오류 · 단언 결과 · 스크린샷
// 갱신 여부 · (2차 그물로) 크로미움 stderr.
import { spawn, spawnSync, execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, readdirSync, statSync } from "node:fs";
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
// 조용히 옛 결과를 보게 되는 종류의 사고라, 관문은 이걸 먼저 확인하고 죽는다. 이건
// `ss` 가 있을 때의 사전 확인이고, `ss` 가 없어도(또는 이 확인을 어떻게든 빠져나가도)
// 진짜 방어는 아래 server.listen 의 'error' 핸들러다 — 실측(node net.Server, 이 Node
// v24 기준): 리스너를 안 달아도 EADDRINUSE 는 Node 가 uncaught exception 으로 시끄럽게
// 죽인다(조용히 넘어가지 않는다). 그래도 스택트레이스 대신 우리 메시지로 죽게 핸들러를
// 명시적으로 단다 — 우연에 기대지 않는다는 뜻이지, 우연이 원래 조용했다는 뜻이 아니다.
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
// 실서버를 부르지 않는다. 관문이 네트워크에 의존하면 관문이 아니라 날씨가 된다. 고정
// 수식(난수 없음)이라 매 실행 결과가 같다 — symbol 을 안 가리면 항상 이 한 시리즈다.
//
// driftMul 기본값(0.12)은 원래 유일했던 계수 그대로다 — 지금 대부분의 라우트가 이 값을
// 물려받는다. 리뷰(2026-08-18 재리뷰)가 잡은 문제: 이 계수로는 ForgeCore.run 이 항상
// verdict.regime="neutral" 을 내서(node 로 basicGraph 를 직접 돌려 확인), 지표 빗의
// 동의(스틸)/반대(자기 방향색) 색 규칙이 브라우저 관문에서 **한 번도 실행되지 않았다**
// (rp-comb-agree/rp-comb-dissent 클래스가 붙은 요소 자체가 존재한 적이 없다 — 죽은 가지).
// driftMul=0.3 은 같은 방식(node 로 basicGraph→verdict.regime 실측)으로 확인한 값이다 —
// bull 로 결정적으로 떨어지고 tone 이 [bull,bull,bear,bull,bull] 로 갈려(동의 4·반대 1)
// 시안 spec-18a.png 실측 배치(4 steel·1 accent)와 그대로 맞는다.
function candles(driftMul) {
  const drift = (typeof driftMul === "number") ? driftMul : 0.12;
  const out = [], day = new Date("2026-08-17T00:00:00Z");
  for (let i = 0; i < 360; i++) {
    const v = 200 + i * drift + Math.sin(i / 11) * 6 + Math.sin(i / 37) * 14;
    const t = new Date(day.getTime() - (359 - i) * 86400000).toISOString().slice(0, 10);
    out.push({ t, o: +(v - 1).toFixed(2), h: +(v + 1.8).toFixed(2), l: +(v - 1.6).toFixed(2),
               c: +v.toFixed(2), v: 1000000 + (i % 23) * 40000 });
  }
  return out;
}
// symbol 별 드리프트 — 없는 심볼은 기본값(0.12, neutral)을 그대로 받는다. 기존 라우트가
// 쓰는 심볼(AAPL 등)은 이 표에 없으니 결과가 전혀 안 바뀐다.
//
// P1a Task 4 가 한때 NVDA·드리프트 -0.7·전용 시작가(base=1800)를 여기 더했었다(3단 대조
// 카드가 종목별로 "심화가 실제로 좁을 때만" 뜨던 시절, 그 경로를 열기 위해서). 컨트롤러
// 판정 D1(리뷰 2026-08-19)로 카드가 모집단 지표만 말하게 되며 그 종목별 분기 자체가
// 필요 없어졌다 — 카드는 이제 어느 종목·드리프트에서든 항상 뜬다(report 라우트에서 직접
// 확인, gate-routes.mjs). 그래서 NVDA 전용 드리프트·base 인자·BASE_BY_SYMBOL 은 걷어냈다.
const DRIFT_BY_SYMBOL = { MSFT: 0.3 };
// 리뷰 I7: 필드명은 wallet-lib.php 의 w_state() 가 실제로 주는 모양(balance/cap/streakDays/
// canCheckin)과 반드시 일치해야 한다 — 예전엔 streak/checkedIn/today 였는데, 그 셋은 서버
// 어디에도 없는 이름이라 screens/wallet.js 의 `state.streakDays % 7` 이 항상 NaN 이 됐다
// (프로덕션 버그가 아니라 이 mock 이 틀린 것 — 스크린샷의 "NaN일 남음"이 그 증거였다).
// canCheckin:true 로 둬서 출석 CTA 프레임(전에는 이 필드가 아예 없어 한 번도 관문에
// 안 걸렸다)도 이 경로에서 그려지게 한다.
const STATE = { balance: 9, cap: 20, streakDays: 3, canCheckin: true };
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
    const urlObj = new URL(req.url, "https://" + HOST);
    const url = decodeURIComponent(urlObj.pathname);
    if (url === "/map/forge-api.php") {
      // api.js 가 실제로 보내는 쿼리(ohlcUrl)의 symbol 로 시리즈를 가른다 — 기존 심볼은
      // DRIFT_BY_SYMBOL 에 없으니 undefined→candles() 기본값(0.12)으로 예전과 동일하다.
      const sym = urlObj.searchParams.get("symbol") || "AAPL";
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, tf: "1day", symbol: sym, candles: candles(DRIFT_BY_SYMBOL[sym]) }));
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

  // ── 리뷰 C1: 콘솔 오류를 크로미움 stderr 태그가 아니라 페이지 안에서 직접 모은다 ──────
  // 실측(이 크로미움 빌드): SEVERE/ERROR:CONSOLE 태그가 전혀 안 찍힌다. console.error 는
  // console.log 와 똑같이 INFO:CONSOLE 로 나온다 — stderr 문자열 매칭으로는 console.error
  // 를 절대 못 잡는다. 게다가 probe() 가 스스로 심는 MSApp.go() 래퍼가
  // catch(e){console.error("GO_FAILED",e)} 라, go() 실패를 관문이 자기가 삼키는 자기모순도
  // 있었다. 그래서 window.onerror · unhandledrejection · console.error 세 경로를 모아
  // title payload(errs)로 실어 보낸다. **다른 스크립트보다 먼저**(globals.js 앞) 심는다 —
  // 늦게 심으면 그 전에 실행되는 스크립트의 오류(2026-08-18 사고의 진짜 재현 조건 — 전역
  // 충돌은 그 전역을 등록하는 스크립트가 실행되는 순간 던진다)를 놓친다.
  const GTAG = '<script src="globals.js"></script>';
  const collector = '<script>(function(){' +
    'window.__gateErrs=[];window.__gateWarns=[];' +
    'window.onerror=function(msg,src,line,col,err){' +
      'window.__gateErrs.push(String((err&&err.stack)||msg));return false;};' +
    'window.addEventListener("unhandledrejection",function(e){' +
      'window.__gateErrs.push("unhandledrejection: "+String((e.reason&&e.reason.stack)||e.reason));});' +
    'var _ce=console.error;console.error=function(){' +
      'window.__gateErrs.push(Array.prototype.slice.call(arguments).map(String).join(" "));' +
      'return _ce.apply(console,arguments);};' +
    'var _cw=console.warn;console.warn=function(){' +
      'window.__gateWarns.push(Array.prototype.slice.call(arguments).map(String).join(" "));' +
      'return _cw.apply(console,arguments);};' +
    '})();</script>\n';
  let html = base.replace(GTAG, collector + GTAG);
  // 리뷰 I2: index.html 이 이 태그를 조금이라도 다르게 쓰면(속성 순서·따옴표·경로 변경 등)
  // String.replace 는 매치가 없을 때 조용히 원본을 그대로 돌려준다(no-op) — 콘솔 오류 수집기
  // (window.__gateErrs)가 안 심겨도 아무도 모른다. 관문은 초록인데 주 판정 그물(judge() 의
  // ①콘솔 오류)이 통째로 안 걸린 채로 돈다는 뜻이라, 여기서 즉시 죽는다.
  if (html === base) {
    console.error("gate-browser: GTAG 치환이 no-op 이다 — index.html 에서 globals.js 태그를 못 찾았다: " + GTAG);
    process.exit(1);
  }

  const TAG = '<script src="app.js"></script>';
  let js = "<script>try{localStorage.clear();";
  for (const [k, v] of Object.entries(route.seed || {})) {
    js += "localStorage.setItem(" + JSON.stringify(k) + "," + JSON.stringify(JSON.stringify(v)) + ");";
  }
  js += "}catch(e){}</script>\n" + TAG;
  if (route.go) js += '\n<script>setTimeout(function(){try{MSApp.go(' + route.go + ');}catch(e){console.error("GO_FAILED",e);}},400);</script>';
  // route.click — go() 만으로 못 여는 상태(예: 심화 티어 시트는 CTA 를 실제로 눌러야 열린다,
  // 시트가 여는 스쿱 잔량 조회가 비동기라 assert 안에서 클릭하면 assert 가 먼저 동기 평가를
  // 끝내버려 열리기 전 DOM 을 본다)를 만들 때 쓴다. go() 가 끝난 뒤(400ms) 별도로 예약해
  // route.clickDelay(기본 1300ms) 뒤 셀렉터를 클릭한다 — assert 의 delay 가 그보다 넉넉히
  // 길어야 클릭의 비동기 후속(예: MSWallet.get() 왕복)이 끝난 DOM 을 assert 가 본다.
  if (route.click) js += '\n<script>setTimeout(function(){try{var el=document.querySelector(' +
    JSON.stringify(route.click) + ');if(el)el.click();else console.error("CLICK_TARGET_MISSING",' +
    JSON.stringify(route.click) + ');}catch(e){console.error("CLICK_FAILED",String(e));}},' +
    (route.clickDelay || 1300) + ');</script>';
  // route.scripts — route.click(단일 클릭)로는 못 짜는 여러 단계짜리 시나리오용. 각 항목이
  // 자기 시각(at)에 예약된 별도 <script> 로 실린다(온보딩 6단계 — 종목 로드가 끝나야 다음
  // 클릭이 의미 있는 것처럼, 단계 사이에 실제 대기가 필요한 라우트). --virtual-time-budget
  // (아래)이 크로미움의 가상 시계를 그 지연만큼 실제로 흘려보내므로, 여러 초 짜리 지연도
  // 실제 벽시계 시간 없이 결정적으로 순서대로 실행된다.
  (route.scripts || []).forEach(s => {
    js += '\n<script>setTimeout(function(){try{' + s.code + '}catch(e){console.error("SCRIPT_FAILED",String(e));}},' + s.at + ');</script>';
  });
  js += '\n<script>setTimeout(function(){var ok=false,err="";' +
        'try{ok=!!(' + route.assert + ');}catch(e){err=String(e);}' +
        'document.title="GATE:"+JSON.stringify({ok:ok,err:err,errs:(window.__gateErrs||[]),warns:(window.__gateWarns||[])});},' +
        (route.delay || 1500) + ');</script>';
  const name = "__gate_" + route.name + ".html";
  const beforeAppTag = html;
  html = html.replace(TAG, js);
  // 같은 이유(위 GTAG 참고) — 이 치환이 no-op 이면 상태 심기(seed)·MSApp.go() 호출·단언
  // 스크립트가 전부 안 심겨 페이지가 index.html 원본 그대로 뜬다. document.title 도 안 바뀌니
  // judge() 의 "단언이 실행되지 않았다(title 없음)" 경로로 새더라도, 원인은 여기서 바로
  // 잡는 게 정직하다.
  if (html === beforeAppTag) {
    console.error("gate-browser: TAG 치환이 no-op 이다 — index.html 에서 app.js 태그를 못 찾았다: " + TAG);
    process.exit(1);
  }
  writeFileSync(path.join(WWW, name), html);
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

function shotPath(route) { return path.join(OUT, "app-" + route.name + ".png"); }

// judge() 는 { problems, warns } 를 돌려준다. problems 는 실패 판정, warns 는 판정에
// 넣지 않는 진단용(console.warn — 앱이 정상 경로에서도 쓴다, 예: report.js 의 에러 이탈
// 로깅). 실패 라우트를 디버깅할 때만 같이 찍는다.
function judge(route, res) {
  const problems = [];
  // 2차 그물 — 크로미움 stderr. 페이지 스크립트가 너무 일찍 죽어 title 자체가 안 생기는
  // 경우(파서가 첫 <script> 조차 못 돌리는 등)를 잡는다. 리뷰 C1 실측: 이 크로미움 빌드는
  // SEVERE/ERROR:CONSOLE 태그를 안 쓴다 — 그래서 이건 보조일 뿐, 주 판정은 아래 errs(페이지
  // 안에서 직접 모은 것)다. 지우지 않고 남긴다(브리프 원안의 최초 방어선이기도 하다).
  for (const line of res.log.split("\n")) {
    if (!/CONSOLE|Uncaught/.test(line)) continue;
    if (/ERROR:CONSOLE|SEVERE|Uncaught/.test(line)) problems.push("콘솔 오류(2차 그물/stderr): " + line.trim());
  }
  const m = res.dom.match(/<title>GATE:([\s\S]*?)<\/title>/);
  if (!m) {
    problems.push("단언이 실행되지 않았다(title 없음) — 화면이 그려지기 전에 죽었을 수 있다");
    return { problems, warns: [] };
  }
  let v = {};
  try {
    const raw = m[1].replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">").replace(/&amp;/g, "&");
    v = JSON.parse(raw);
  } catch (e) {
    problems.push("단언 결과 파싱 실패: " + m[1]);
    return { problems, warns: [] };
  }
  // ① 콘솔 오류(주 판정) — window.onerror·unhandledrejection·console.error 를 페이지
  // 안에서 직접 모은 것. probe() 의 GO_FAILED 캐치도 여기로 들어온다(더는 자기가 자기를
  // 안 삼킨다).
  const errs = Array.isArray(v.errs) ? v.errs : [];
  errs.forEach(e => problems.push("콘솔 오류: " + e));
  const warns = Array.isArray(v.warns) ? v.warns : [];
  // ② 단언
  if (!v.ok) problems.push("단언 실패: " + route.assert + (v.err ? " (" + v.err + ")" : ""));
  return { problems, warns };
}

assertPortFree();
mkdirSync(OUT, { recursive: true });
const libDir = ensureLibs();
const creds = ensureCert();
const server = serve(creds);
// 리뷰 M2 — 명시적으로 죽인다(위 assertPortFree 주석 참고. 기본 동작도 이미 시끄럽게
// 죽지만, 우리 메시지로 통일해 둔다).
server.on("error", (e) => {
  console.error("HTTPS mock 서버가 못 떴다(" + e.code + ") — 포트 " + PORT + ": " + String(e));
  process.exit(1);
});
await new Promise(r => server.listen(PORT, "127.0.0.1", r));

const only = process.argv.slice(2);
const routes = only.length ? ROUTES.filter(r => only.includes(r.name)) : ROUTES;
let failed = 0;
for (const route of routes) {
  // 프로브 페이지는 try/finally 로 지운다 — 이 안에서 예외가 나도(예: 크로미움이 죽는다)
  // www/ 에 __gate_*.html 이 남으면 안 된다(작업 트리에 남기지 않는다는 요구사항).
  const page = probe(route);
  try {
    const sp = shotPath(route);
    const beforeMtime = existsSync(sp) ? statSync(sp).mtimeMs : 0;
    const shotRes = await shoot(route, page, libDir);
    const { problems, warns } = judge(route, shotRes);
    // 리뷰 I1 — 스크린샷이 실제로 갱신됐는지 확인한다. --screenshot= 플래그만 넘기고 파일이
    // 정말 생겼는지 아무도 안 보면, 크로미움이 컴포지트 전에 죽어도 콘솔·단언만 통과하면
    // 초록이 된다.
    if (!existsSync(sp)) problems.push("스크린샷이 생성되지 않았다: " + sp);
    else {
      const st = statSync(sp);
      if (st.size === 0) problems.push("스크린샷 파일 크기가 0이다: " + sp);
      else if (st.mtimeMs <= beforeMtime) problems.push("스크린샷이 갱신되지 않았다(mtime 그대로): " + sp);
    }
    if (problems.length) {
      failed++; console.log("✗ " + route.name); problems.forEach(p => console.log("    " + p));
      if (warns.length) {
        console.log("    진단(console.warn, 판정에는 미포함):");
        warns.forEach(w => console.log("      " + w));
      }
    } else console.log("✓ " + route.name);
  } finally {
    rmSync(path.join(WWW, page), { force: true });
  }
}
server.close();
console.log(failed ? "\n브라우저 관문 실패 " + failed + "건" : "\n브라우저 관문 " + routes.length + "건 통과");
process.exit(failed ? 1 : 0);
