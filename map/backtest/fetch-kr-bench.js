// backtest/fetch-kr-bench.js — 상대강도 도메인 확장용 픽스처 수집(1회성)
// ① 한국주식 10종 + KOSPI: Naver siseJson 직접(구간 분할 2012~현재, 프록시 4년창 한계 우회) → fixtures-kr/
// ② 미국 섹터 ETF 8종: forge-api 프록시 → fixtures-bench/
// 별도 디렉토리 사용(중요): fixtures/에 넣으면 excess-lab·stack-lab 자동 스캔 유니버스가 조용히 바뀜.
"use strict";
const fs = require("fs"), path = require("path");

const KR = ["005930", "000660", "005380", "012330", "035420", "035720", "051910", "055550", "068270", "105560", "KOSPI"];
const CHUNKS = [["20120101", "20151231"], ["20160101", "20191231"], ["20200101", "20231231"], ["20240101", "20261231"]];
const ETFS = ["XLK", "XLF", "XLV", "XLP", "XLY", "XLE", "XLI", "XLC"];
const API = process.env.BT_API || "https://parksvc.mycafe24.com/map/forge-api.php";
const _sleep = ms => new Promise(r => setTimeout(r, ms));

async function naverChunk(code, s, e) {
  const u = "https://api.finance.naver.com/siseJson.naver?symbol=" + code + "&requestType=1&startTime=" + s + "&endTime=" + e + "&timeframe=day";
  const res = await fetch(u, { headers: { "User-Agent": "Mozilla/5.0" } });
  const raw = await res.text();
  const out = [];
  const re = /\["(\d{8})",\s*([0-9.]+),\s*([0-9.]+),\s*([0-9.]+),\s*([0-9.]+),\s*([0-9.]+)/g;
  let m; while ((m = re.exec(raw))) {
    const c = +m[5];
    if (isFinite(c) && c > 0) out.push({ t: m[1].slice(0, 4) + "-" + m[1].slice(4, 6) + "-" + m[1].slice(6, 8), o: +m[2], h: +m[3], l: +m[4], c, v: +m[6] });
  }
  return out;
}

async function fetchKR() {
  const dir = path.join(__dirname, "fixtures-kr");
  fs.mkdirSync(dir, { recursive: true });
  for (const code of KR) {
    const fp = path.join(dir, code + "-1day.json");
    if (fs.existsSync(fp) && process.env.BT_FORCE !== "1") { console.log("스킵(기존):", code); continue; }
    const seen = new Map();   // 날짜 중복 제거(구간 경계)
    for (const [s, e] of CHUNKS) {
      try { for (const c of await naverChunk(code, s, e)) seen.set(c.t, c); } catch (err) { console.warn("청크 실패:", code, s, err.message); }
      await _sleep(700);
    }
    const candle = [...seen.values()].sort((a, b) => a.t < b.t ? -1 : 1);
    if (candle.length < 600) { console.warn("건너뜀(부족):", code, candle.length + "봉"); continue; }
    fs.writeFileSync(fp, JSON.stringify({ symbol: code, tf: "1day", from: candle[0].t, to: candle[candle.length - 1].t, candle }));
    console.log("저장:", code, candle.length, "봉", candle[0].t, "~", candle[candle.length - 1].t);
  }
}

async function fetchETF() {
  const dir = path.join(__dirname, "fixtures-bench");
  fs.mkdirSync(dir, { recursive: true });
  for (const sym of ETFS) {
    const fp = path.join(dir, sym + "-1day.json");
    if (fs.existsSync(fp) && process.env.BT_FORCE !== "1") { console.log("스킵(기존):", sym); continue; }
    try {
      const res = await fetch(API + "?ohlc=1&symbol=" + sym + "&tf=1day", { cache: "no-store" });
      const j = await res.json();
      if (!j || !j.ok || !Array.isArray(j.candles)) { console.warn("실패:", sym); await _sleep(8500); continue; }
      const candle = j.candles.map(d => ({ t: String(d.t || d.datetime || "").slice(0, 10), o: +d.o, h: +d.h, l: +d.l, c: +d.c, v: d.v != null ? +d.v : undefined })).filter(d => isFinite(d.c) && d.c > 0);
      if (candle.length < 600) { console.warn("건너뜀(부족):", sym, candle.length); await _sleep(8500); continue; }
      fs.writeFileSync(fp, JSON.stringify({ symbol: sym, tf: "1day", from: candle[0].t, to: candle[candle.length - 1].t, candle }));
      console.log("저장:", sym, candle.length, "봉");
    } catch (e) { console.warn("실패:", sym, e.message); }
    await _sleep(8500);   // TD 무료티어 레이트리밋
  }
}

(async () => { await fetchKR(); await fetchETF(); console.log("완료"); })();
